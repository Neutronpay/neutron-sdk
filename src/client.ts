import crypto from "crypto";
import type { NeutronConfig, AuthResponse } from "./types.js";
import {
  NeutronApiError,
  NeutronAuthError,
  NeutronTimeoutError,
} from "./errors.js";

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

  constructor(config: NeutronConfig) {
    if (!config.apiKey) throw new NeutronAuthError("apiKey is required");
    if (!config.apiSecret) throw new NeutronAuthError("apiSecret is required");

    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.debug = config.debug ?? false;
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

    return result;
    this.log("Authenticated", { accountId: this.accountId });
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
