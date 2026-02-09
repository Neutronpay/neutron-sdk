// ── Satoshi / BTC conversion ────────────────────────────────

const SATS_PER_BTC = 100_000_000;

/**
 * Convert satoshis to BTC.
 * @example satsToBtc(10000) // 0.0001
 */
export function satsToBtc(sats: number): number {
  return sats / SATS_PER_BTC;
}

/**
 * Convert BTC to satoshis.
 * @example btcToSats(0.0001) // 10000
 */
export function btcToSats(btc: number): number {
  return Math.round(btc * SATS_PER_BTC);
}

/**
 * Format a satoshi amount as a human-readable string.
 * @example formatSats(1500000) // "1,500,000 sats"
 * @example formatSats(100) // "100 sats"
 */
export function formatSats(sats: number): string {
  return `${sats.toLocaleString("en-US")} sats`;
}

/**
 * Format a BTC amount with appropriate precision.
 * @example formatBtc(0.00015) // "0.00015000 BTC"
 */
export function formatBtc(btc: number): string {
  return `${btc.toFixed(8)} BTC`;
}

// ── Constants ───────────────────────────────────────────────

/** Supported currencies */
export const Currency = {
  BTC: "BTC",
  USDT: "USDT",
  VND: "VND",
  USD: "USD",
  CAD: "CAD",
  NGN: "NGN",
  KES: "KES",
  GHS: "GHS",
} as const;

export type Currency = (typeof Currency)[keyof typeof Currency];

/** Payment methods for sourceReq/destReq */
export const PaymentMethod = {
  /** Internal Neutron wallet */
  NEUTRON: "neutronpay",
  /** Lightning Network (BOLT11 invoices) */
  LIGHTNING: "lightning",
  /** Lightning Address / LNURL */
  LNURL: "lnurl",
  /** Bitcoin on-chain */
  ON_CHAIN: "on-chain",
  /** USDT on TRON (TRC-20) */
  TRON: "tron",
  /** USDT on Ethereum (ERC-20) */
  ETH: "eth",
  /** Vietnamese Dong instant bank transfer */
  VND_INSTANT: "vnd-instant",
} as const;

export type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/** Transaction final states (terminal — won't change) */
export const FinalStates = [
  "completed",
  "expired",
  "rejected",
  "error",
  "usercanceled",
] as const;

/** All transaction states */
export const TransactionStates = {
  QUOTED: "quoted",
  USER_CONFIRMED: "userconfirmed",
  SRC_CREATED: "srccreated",
  SRC_SENT: "srcsent",
  SRC_INTENT: "srcintent",
  SRC_PEND_CONFIRM: "srcpendconfirmfill",
  SRC_CONFIRMED: "srcconfirmfilled",
  DEST_PEND_SENT: "destpendsent",
  DEST_SENT: "destsent",
  COMPLETED: "completed",
  EXPIRED: "expired",
  REJECTED: "rejected",
  ERROR: "error",
  USER_CANCELED: "usercanceled",
} as const;

/** USDT blockchain options */
export const Chain = {
  TRON: "TRON",
  ETH: "ETH",
} as const;
