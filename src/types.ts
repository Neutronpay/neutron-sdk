// ── Config ──────────────────────────────────────────────────

export interface NeutronConfig {
  /** Your Neutron API key */
  apiKey: string;
  /** Your Neutron API secret */
  apiSecret: string;
  /** API base URL (default: https://api.neutron.me) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retry attempts for 5xx/network errors (default: 2) */
  maxRetries?: number;
  /** Enable debug logging to stderr (default: false) */
  debug?: boolean;
}

// ── Auth ────────────────────────────────────────────────────

export interface AuthResponse {
  accountId: string;
  accessToken: string;
  expiredAt: number;
}

// ── Account ─────────────────────────────────────────────────

export interface Account {
  id: string;
  displayName: string;
  status: string;
  country: string;
  timezone: string;
  [key: string]: any;
}

export interface Wallet {
  id: string;
  ccy: string;
  amount: number;
  availableBalance: number;
  [key: string]: any;
}

// ── Transactions ────────────────────────────────────────────

export type TransactionState =
  | "quoted"
  | "userconfirmed"
  | "srccreated"
  | "srcsent"
  | "srcintent"
  | "srcpendconfirmfill"
  | "srcconfirmfilled"
  | "destpendsent"
  | "destsent"
  | "completed"
  | "expired"
  | "rejected"
  | "error"
  | "usercanceled";

export type PaymentMethod =
  | "neutronpay"
  | "lightning"
  | "on-chain"
  | "lnurl"
  | "tron"
  | "eth"
  | "vnd-instant"
  | string;

export interface TransactionSide {
  ccy: string;
  method: PaymentMethod;
  amtRequested?: number;
  reqDetails?: Record<string, any>;
  kyc?: KycInfo;
  notes?: string;
  neutronpayFees?: number;
  networkFees?: number;
  expiresAt?: number;
  [key: string]: any;
}

export interface KycInfo {
  type: "individual" | "business";
  details: {
    legalFullName: string;
    countryCode: string;
    [key: string]: any;
  };
}

export interface SourceOfFunds {
  /** Purpose of transfer (see docs.neutron.me/reference/purpose-values) */
  purpose: number;
  /** Source of funds (see docs.neutron.me/reference/source) */
  source: number;
  /** Relationship to recipient (see docs.neutron.me/reference/relationship) */
  relationship: number;
}

export interface CreateTransactionRequest {
  sourceReq: TransactionSide;
  destReq: TransactionSide;
  extRefId?: string;
  sourceOfFunds?: SourceOfFunds;
}

export interface Transaction {
  txnId: string;
  txnState: TransactionState;
  sourceReq: TransactionSide;
  destReq: TransactionSide;
  extRefId?: string;
  fxRate?: number;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: any;
}

export interface ListTransactionsParams {
  status?: string;
  method?: string;
  currency?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// ── Lightning ───────────────────────────────────────────────

export interface CreateInvoiceParams {
  /** Amount in satoshis (use this OR amountBtc) */
  amountSats?: number;
  /** Amount in BTC (use this OR amountSats) */
  amountBtc?: number;
  /** Invoice description shown to the payer */
  memo?: string;
  /** Your reference ID for tracking */
  extRefId?: string;
}

export interface LightningInvoice {
  txnId: string;
  invoice: string;
  qrPageUrl?: string;
  amountBtc: number;
  amountSats: number;
  status: TransactionState;
}

export interface DecodedInvoice {
  /** Amount in BTC (may be undefined if invoice has no amount) */
  amount?: number;
  /** Invoice description/memo */
  description?: string;
  /** Payment hash */
  paymentHash?: string;
  /** Destination node pubkey */
  destination?: string;
  /** Invoice timestamp */
  timestamp?: number;
  /** Invoice expiry in seconds */
  expiry?: number;
  /** Raw invoice string */
  invoice: string;
}

// ── Receive Addresses ───────────────────────────────────────

export interface BtcAddress {
  staticOnchainAddress: string;
  accountId: string;
}

export interface UsdtAddress {
  staticOnchainAddress: string;
  walletCcy: string;
  chainId: string;
  accountId: string;
}

// ── Webhooks ────────────────────────────────────────────────

export interface CreateWebhookParams {
  /** HTTPS callback URL */
  callback: string;
  /** Secret for signature verification */
  secret: string;
}

export interface UpdateWebhookParams {
  callback?: string;
  secret?: string;
}

export interface Webhook {
  id: string;
  callback: string;
  createdAt: number;
  [key: string]: any;
}

// ── Rates ───────────────────────────────────────────────────

export interface ExchangeRates {
  [pair: string]: number;
}

// ── Fiat ────────────────────────────────────────────────────

export interface FiatInstitution {
  code: string;
  name: string;
  [key: string]: any;
}

// ── API Response Wrapper ────────────────────────────────────

export interface ApiResponse<T = any> {
  resultStatus?: string;
  data?: T;
  code?: string;
  error?: string;
  errorMetadata?: Record<string, any>;
}
