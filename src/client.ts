import crypto from "crypto";
import type { NeutronConfig, AuthResponse } from "./types.js";
import {
  NeutronApiError,
  NeutronAuthError,
  NeutronTimeoutError,
} from "./errors.js";
import { L402Manager, type L402Token } from "./resources/l402.js";

const DEFAULT_BASE_URL = "https://api.neutron.me";
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh 1 min before expiry

export class HttpClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly debug: boolean;

  private accessToken: string | null = null;
  private accountId: string | null = null;
  private tokenExpiry: number = 0;

  // L402
  private l402Manager: L402Manager | null = null;
  private l402PayFn: ((invoice: string) => Promise<string>) | null = null;

  constructor(config: NeutronConfig) {
    if (!config.apiKey) throw new NeutronAuthError("apiKey is required");
    if (!config.apiSecret) throw new NeutronAuthError("apiSecret is required");

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.debug = config.debug ?? false;

    // SECURITY: validate baseUrl to prevent SSRF
    this.validateBaseUrl(this.baseUrl);
  }

  private validateBaseUrl(url: string): void {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") {
        throw new NeutronAuthError("baseUrl must use HTTPS");
      }
      const blocked = ["localhost", "127.", "0.0.0.0", "169.254.", "10.", "192.168.", "172."];
      if (blocked.some(b => u.hostname.startsWith(b))) {
        throw new NeutronAuthError(`baseUrl blocked: ${u.hostname}`);
      }
    } catch (e) {
      if (e instanceof NeutronAuthError) throw e;
      throw new NeutronAuthError(`Invalid baseUrl: ${url}`);
    }
  }

  private log(message: string, data?: any): void {
    if (!this.debug) return;
    const ts = new Date().toISOString();
    const extra = data ? ` ${JSON.stringify(data)}` : "";
    console.error(`[neutron-sdk ${ts}] ${message}${extra}`);
  }

  // ── Auth ──────────────────────────────────────────────

  private generateSignature(payload: string): string {
    const stringToSign = `${this.apiKey}&payload=${payload}`;
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(stringToSign)
      .digest("hex");
  }

  private get isTokenValid(): boolean {
    return !!(
      this.accessToken &&
      this.accountId &&
      Date.now() < this.tokenExpiry - TOKEN_REFRESH_BUFFER_MS
    );
  }

  async authenticate(): Promise<AuthResponse> {
    const payload = JSON.stringify({ test: "auth" });
    const signature = this.generateSignature(payload);

    const response = await this.rawFetch(
      `${this.baseUrl}/api/v2/authentication/token-signature`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.apiKey,
          "X-Api-Signature": signature,
        },
        body: payload,
      }
    );

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as Record<string, any>;
      throw new NeutronAuthError(
        body.error || body.message || `Authentication failed (${response.status})`
      );
    }

    const raw = (await response.json()) as any;
    // API wraps auth response in { data: { ... } }
    const result: AuthResponse = raw.data ?? raw;
    this.accountId = result.accountId;
    this.accessToken = result.accessToken;
    this.tokenExpiry = typeof result.expiredAt === "number"
      ? result.expiredAt
      : new Date(result.expiredAt).getTime();

    this.log("Authenticated", { accountId: this.accountId });
    return result;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.isTokenValid) {
      await this.authenticate();
    }
  }

  getAccountId(): string {
    if (!this.accountId) {
      throw new NeutronAuthError("Not authenticated. Call a method first or use neutron.account.get().");
    }
    return this.accountId;
  }

  async ensureAuthAndGetAccountId(): Promise<string> {
    await this.ensureAuth();
    return this.accountId!;
  }

  /**
   * Returns auth headers for use in raw fetch calls (e.g. SSE streams).
   * Ensures a valid token is present before returning.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    await this.ensureAuth();
    return {
      Authorization: `Bearer ${this.accessToken}`,
    };
  }

  // ── HTTP ──────────────────────────────────────────────

  private async rawFetch(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new NeutronTimeoutError(this.timeout);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T = any>(method: string, path: string, body?: any): Promise<T> {
    await this.ensureAuth();

    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s...
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt - 1) * 1000));

        // Re-auth if token might have expired during retries
        if (!this.isTokenValid) await this.authenticate();
      }

      const url = `${this.baseUrl}${path}`;
      this.log(`${method} ${path}`);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      };

      const response = await this.rawFetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      // L402 — auto-pay if enabled
      if (response.status === 402 && this.l402Manager && this.l402PayFn) {
        const wwwAuth = response.headers.get("www-authenticate") || "";
        if (wwwAuth.startsWith("L402 ")) {
          try {
            const challenge = this.l402Manager.parseChallenge(wwwAuth);
            this.log("L402 challenge received", { amountSats: challenge.amountSats, path });
            const preimage = await this.l402PayFn(challenge.invoice);
            const token: L402Token = { macaroon: challenge.macaroon, preimage };
            this.l402Manager.storeToken(path, token);
            // Inject L402 auth and retry immediately (don't count as a retry)
            const l402Headers: Record<string, string> = {
              Authorization: `Bearer ${this.accessToken}`,
              "Content-Type": "application/json",
              "X-L402-Token": this.l402Manager.buildAuthHeader(token),
            };
            const retryResponse = await this.rawFetch(`${this.baseUrl}${path}`, {
              method,
              headers: l402Headers,
              body: body ? JSON.stringify(body) : undefined,
            });
            if (retryResponse.ok) {
              return (await retryResponse.json()) as T;
            }
          } catch (l402Err) {
            this.log("L402 payment failed", { error: l402Err });
            // Fall through to normal error handling
          }
        }
      }

      const errorBody = await response.json().catch(() => ({}));
      const apiError = new NeutronApiError(response.status, errorBody);

      // Re-authenticate on 401 and retry
      if (response.status === 401 && attempt < this.maxRetries) {
        this.accessToken = null;
        lastError = apiError;
        continue;
      }

      // Retry on 5xx and 429
      if (apiError.isRetryable && attempt < this.maxRetries) {
        lastError = apiError;
        continue;
      }

      throw apiError;
    }

    throw lastError;
  }

  /**
   * Enable L402 automatic payment handling.
   * When enabled, the client will automatically pay 402 challenges using the provided function.
   *
   * @param payFn - Receives a BOLT11 invoice, returns the payment preimage hex
   *
   * @example
   * neutron.enableL402(async (invoice) => {
   *   const result = await neutron.lightning.payInvoice(invoice);
   *   return result.preimage;
   * });
   */
  enableL402(payFn: (invoice: string) => Promise<string>): void {
    this.l402Manager = new L402Manager();
    this.l402PayFn = payFn;
  }

  /** Access the L402 manager directly for manual flows */
  get l402(): L402Manager {
    if (!this.l402Manager) {
      this.l402Manager = new L402Manager();
    }
    return this.l402Manager;
  }

  async get<T = any>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = any>(path: string, body?: any): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  async del<T = any>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
