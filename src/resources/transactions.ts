import type { HttpClient } from "../client.js";
import type {
  Transaction,
  CreateTransactionRequest,
  ListTransactionsParams,
} from "../types.js";

export class TransactionsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a transaction (returns a quote). Call `.confirm()` to execute.
   *
   * @example
   * // Lightning receive (create invoice)
   * const txn = await neutron.transactions.create({
   *   sourceReq: { ccy: "BTC", method: "lightning", reqDetails: {} },
   *   destReq: { ccy: "BTC", method: "neutronpay", amtRequested: 0.0001, reqDetails: {} },
   * });
   *
   * @example
   * // Lightning send (pay invoice)
   * const txn = await neutron.transactions.create({
   *   sourceReq: { ccy: "BTC", method: "neutronpay" },
   *   destReq: { ccy: "BTC", method: "lightning", reqDetails: { paymentRequest: "lnbc..." } },
   * });
   *
   * @example
   * // Internal swap (BTC → USDT)
   * const txn = await neutron.transactions.create({
   *   sourceReq: { ccy: "BTC", method: "neutronpay", amtRequested: 0.001, reqDetails: {} },
   *   destReq: { ccy: "USDT", method: "neutronpay", reqDetails: {} },
   * });
   */
  async create(params: CreateTransactionRequest): Promise<Transaction> {
    return this.client.post<Transaction>(`/api/v2/transaction`, params);
  }

  /**
   * Confirm a quoted transaction to execute it.
   * After confirmation, Lightning invoices become payable and sends are dispatched.
   */
  async confirm(txnId: string): Promise<Transaction> {
    return this.client.put<Transaction>(`/api/v2/transaction/${txnId}/confirm`);
  }

  /**
   * Get transaction status and details.
   */
  async get(txnId: string): Promise<Transaction> {
    return this.client.get<Transaction>(`/api/v2/transaction/${txnId}`);
  }

  /**
   * List transactions with optional filters.
   *
   * @example
   * const completed = await neutron.transactions.list({ status: "completed", limit: 10 });
   */
  async list(params?: ListTransactionsParams): Promise<Transaction[]> {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) qs.append(k, String(v));
      }
    }
    const query = qs.toString();
    const res = await this.client.get(`/api/v2/transaction${query ? `?${query}` : ""}`);
    return res.data ?? res;
  }

  /**
   * Cancel a quoted (unconfirmed) transaction.
   */
  async cancel(txnId: string): Promise<Transaction> {
    return this.client.put<Transaction>(`/api/v2/transaction/${txnId}/cancel`);
  }

  /**
   * Wait for a transaction to reach a final state. Polls at the given interval.
   *
   * @param txnId Transaction ID
   * @param options.intervalMs Polling interval in ms (default: 3000)
   * @param options.timeoutMs Max wait time in ms (default: 300000 = 5 min)
   * @param options.onStateChange Callback fired on each state change
   * @returns The transaction in a final state
   *
   * @example
   * const txn = await neutron.transactions.waitForCompletion(txnId, {
   *   onStateChange: (state) => console.log("State:", state),
   * });
   */
  async waitForCompletion(
    txnId: string,
    options?: {
      intervalMs?: number;
      timeoutMs?: number;
      onStateChange?: (state: string, txn: Transaction) => void;
    }
  ): Promise<Transaction> {
    const FINAL_STATES = ["completed", "failed", "expired", "rejected", "error", "usercanceled"];
    const interval = options?.intervalMs ?? 3000;
    const timeout = options?.timeoutMs ?? 300_000;
    const start = Date.now();
    let lastState = "";

    while (Date.now() - start < timeout) {
      const txn = await this.get(txnId);

      if (txn.txnState !== lastState) {
        lastState = txn.txnState;
        options?.onStateChange?.(txn.txnState, txn);
      }

      if (FINAL_STATES.includes(txn.txnState)) {
        return txn;
      }

      await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Transaction ${txnId} did not complete within ${timeout}ms`);
  }
}
