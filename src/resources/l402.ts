/**
 * L402 — Lightning HTTP 402 Authentication
 *
 * Enables pay-per-use and subscription access to Neutron APIs.
 * Clients pay a Lightning invoice and use the preimage + macaroon as auth.
 *
 * @see https://docs.neutron.me/l402
 */

export interface L402Challenge {
  /** BOLT11 Lightning invoice to pay */
  invoice: string;
  /** Base64-encoded macaroon from server */
  macaroon: string;
  /** Amount in satoshis */
  amountSats: number;
  /** Unix timestamp when challenge expires */
  expiresAt: number;
}

export interface L402Token {
  /** Base64-encoded macaroon */
  macaroon: string;
  /** Payment preimage hex — proof of payment */
  preimage: string;
}

/**
 * Parse a WWW-Authenticate: L402 header into a challenge object.
 *
 * @example
 * // Server returns:
 * // WWW-Authenticate: L402 macaroon="...", invoice="lnbc10n1..."
 * const challenge = L402Manager.parseChallenge(response.headers['www-authenticate']);
 */
export function parseL402Challenge(header: string): L402Challenge {
  if (!header || !header.startsWith("L402 ")) {
    throw new Error("Invalid L402 WWW-Authenticate header");
  }

  const extract = (key: string): string => {
    const match = header.match(new RegExp(`${key}="([^"]+)"`));
    if (!match) throw new Error(`Missing ${key} in L402 header`);
    return match[1];
  };

  const invoice = extract("invoice");
  const macaroon = extract("macaroon");

  // Decode amount from invoice (lnbc<amount><multiplier>1...)
  const amountSats = decodeInvoiceAmount(invoice);

  // Default expiry: 5 minutes from now
  const expiresAt = Math.floor(Date.now() / 1000) + 300;

  return { invoice, macaroon, amountSats, expiresAt };
}

/**
 * Build an Authorization: L402 header from a token.
 *
 * @example
 * const header = buildL402AuthHeader({ macaroon: "...", preimage: "abc123..." });
 * // Returns: "L402 <macaroon>:<preimage>"
 */
export function buildL402AuthHeader(token: L402Token): string {
  return `L402 ${token.macaroon}:${token.preimage}`;
}

/**
 * Decode the amount in satoshis from a BOLT11 invoice.
 * Returns 0 if amount cannot be determined.
 */
function decodeInvoiceAmount(invoice: string): number {
  try {
    // BOLT11: lnbc<amount><multiplier>1...
    // Multipliers: m=milli, u=micro, n=nano, p=pico (of BTC)
    const match = invoice.toLowerCase().match(/^ln\w+?(\d+)([munp])?1/);
    if (!match) return 0;

    const amount = parseInt(match[1], 10);
    const multiplier = match[2] || "";

    // Convert to sats (1 BTC = 100,000,000 sats)
    const multipliers: Record<string, number> = {
      "m": 100_000,       // milli-BTC → sats
      "u": 100,           // micro-BTC → sats
      "n": 0.1,           // nano-BTC → sats
      "p": 0.0001,        // pico-BTC → sats
      "":  100_000_000,   // BTC → sats
    };

    return Math.round(amount * (multipliers[multiplier] ?? 0));
  } catch {
    return 0;
  }
}

/**
 * L402Manager — handles token caching and challenge/response flow.
 * One instance per SDK client.
 */
export class L402Manager {
  private readonly cache = new Map<string, L402Token>();

  /**
   * Store a token for an endpoint path.
   * Key is normalized to just the path (no query string).
   */
  storeToken(endpoint: string, token: L402Token): void {
    const key = this.normalizeKey(endpoint);
    this.cache.set(key, token);
  }

  /**
   * Retrieve a cached token for an endpoint, or null if not found.
   */
  getToken(endpoint: string): L402Token | null {
    const key = this.normalizeKey(endpoint);
    return this.cache.get(key) ?? null;
  }

  /**
   * Clear cached token for an endpoint (e.g. on 401 after 402 pay).
   */
  clearToken(endpoint: string): void {
    this.cache.delete(this.normalizeKey(endpoint));
  }

  /**
   * Clear all cached tokens.
   */
  clearAll(): void {
    this.cache.clear();
  }

  parseChallenge(header: string): L402Challenge {
    return parseL402Challenge(header);
  }

  buildAuthHeader(token: L402Token): string {
    return buildL402AuthHeader(token);
  }

  private normalizeKey(endpoint: string): string {
    try {
      const url = new URL(endpoint, "https://api.neutron.me");
      return url.pathname;
    } catch {
      return endpoint.split("?")[0];
    }
  }
}
