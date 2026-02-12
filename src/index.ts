import { HttpClient } from "./client.js";
import { AccountResource } from "./resources/account.js";
import { TransactionsResource } from "./resources/transactions.js";
import { LightningResource } from "./resources/lightning.js";
import { WebhooksResource } from "./resources/webhooks.js";
import { RatesResource } from "./resources/rates.js";
import { FiatResource } from "./resources/fiat.js";
import type { NeutronConfig } from "./types.js";

/**
 * Neutron SDK — Bitcoin Lightning, stablecoins, and fiat payments.
 *
 * @example
 * import { Neutron } from "neutron-sdk";
 *
 * const neutron = new Neutron({
 *   apiKey: process.env.NEUTRON_API_KEY!,
 *   apiSecret: process.env.NEUTRON_API_SECRET!,
 * });
 *
 * // Check balances
 * const wallets = await neutron.account.wallets();
 *
 * // Create a Lightning invoice
 * const invoice = await neutron.lightning.createInvoice({ amountSats: 10000 });
 *
 * // Send to a Lightning Address
 * const txn = await neutron.lightning.payAddress("alice@getalby.com", { amountSats: 5000 });
 * await neutron.transactions.confirm(txn.txnId);
 */
export class Neutron {
  /** Account info, wallets, and deposit addresses */
  readonly account: AccountResource;
  /** Create, confirm, list, and track transactions */
  readonly transactions: TransactionsResource;
  /** Lightning invoices, payments, and utilities */
  readonly lightning: LightningResource;
  /** Webhook management */
  readonly webhooks: WebhooksResource;
  /** BTC exchange rates */
  readonly rates: RatesResource;
  /** Fiat payouts and bank lookups */
  readonly fiat: FiatResource;

  private readonly client: HttpClient;

  constructor(config: NeutronConfig) {
    this.client = new HttpClient(config);
    this.account = new AccountResource(this.client);
    this.transactions = new TransactionsResource(this.client);
    this.lightning = new LightningResource(this.client);
    this.webhooks = new WebhooksResource(this.client);
    this.rates = new RatesResource(this.client);
    this.fiat = new FiatResource(this.client);
  }

  /**
   * Explicitly authenticate and verify credentials.
   * Usually not needed — the SDK auto-authenticates on first request.
   */
  async authenticate() {
    return this.client.authenticate();
  }

  /**
   * Verify a webhook signature. Static method — no client instance needed.
   *
   * @example
   * const event = Neutron.verifyWebhook(req.body, req.headers["x-neutronpay-signature"], secret);
   */
  static verifyWebhook(body: string | Buffer, signature: string | undefined | null, secret: string) {
    return WebhooksResource.verifySignature(body, signature, secret);
  }
}

// ── Exports ─────────────────────────────────────────────────

export { HttpClient } from "./client.js";
export { AccountResource } from "./resources/account.js";
export { TransactionsResource } from "./resources/transactions.js";
export { LightningResource } from "./resources/lightning.js";
export { WebhooksResource } from "./resources/webhooks.js";
export { RatesResource } from "./resources/rates.js";
export { FiatResource } from "./resources/fiat.js";
export type { FiatPayoutParams } from "./resources/fiat.js";

export { sanitizePathParam } from "./sanitize.js";

export {
  NeutronError,
  NeutronApiError,
  NeutronAuthError,
  NeutronTimeoutError,
  NeutronValidationError,
} from "./errors.js";

export {
  satsToBtc,
  btcToSats,
  formatSats,
  formatBtc,
  Currency,
  PaymentMethod,
  TransactionStates,
  FinalStates,
  Chain,
} from "./utils.js";

export type {
  Currency as CurrencyType,
  PaymentMethodType,
} from "./utils.js";

export type {
  NeutronConfig,
  AuthResponse,
  Account,
  Wallet,
  Transaction,
  TransactionState,
  TransactionSide,
  PaymentMethod as PaymentMethodString,
  CreateTransactionRequest,
  ListTransactionsParams,
  CreateInvoiceParams,
  LightningInvoice,
  BtcAddress,
  UsdtAddress,
  Webhook,
  CreateWebhookParams,
  UpdateWebhookParams,
  ExchangeRates,
  FiatInstitution,
  KycInfo,
  SourceOfFunds,
  ApiResponse,
} from "./types.js";
