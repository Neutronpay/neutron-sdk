import type { HttpClient } from "../client.js";
import type {
  Transaction,
  CreateTransactionRequest,
  ListTransactionsParams,
  TransactionEvent,
} from "../types.js";
import { sanitizePathParam } from "../sanitize.js";

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
    sanitizePathParam(txnId, "txnId");
    return this.client.put<Transaction>(`/api/v2/transaction/${txnId}/confirm`);
  }

  /**
   * Get transaction status and details.
   */
  async get(txnId: string): Promise<Transaction> {
    sanitizePathParam(txnId, "txnId");
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
   *
   * @deprecated This endpoint is not currently available on the Neutron API.
   * Unconfirmed transactions expire automatically after their TTL.
   */
  async cancel(_txnId: string): Promise<Transaction> {
    throw new Error(
      "transactions.cancel() is not available. Unconfirmed transactions expire automatically."
    );
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

  /**
   * Stream real-time transaction status updates via SSE.
   * For agents without a public endpoint who can't receive webhook POSTs.
   *
   * NOTE: Requires the server-side endpoint /api/v2/events/stream (not yet live).
   * Use neutron.transactions.waitForCompletion() as a polling fallback in the meantime.
   *
   * @example
   * for await (const event of neutron.transactions.subscribe("txn-123")) {
   *   console.log(event.status);
   *   if (event.status === "completed") break;
   * }
   */
  async *subscribe(transactionId: string, timeoutMs = 60_000): AsyncGenerator<TransactionEvent> {
    // SECURITY: validate transactionId is a UUID to prevent SSRF/path traversal
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(transactionId)) {
      throw new Error("Invalid transactionId: must be a UUID.");
    }

    // SECURITY: clamp timeout to 5s–300s to prevent resource exhaustion
    const clampedTimeout = Math.min(Math.max(timeoutMs, 5_000), 300_000);

    // Safe: transactionId validated as UUID above
    const url = `${this.client.baseUrl}/api/v2/events/stream?transactionId=${transactionId}`;
    const response = await fetch(url, {
      headers: {
        "Accept": "text/event-stream",
        ...(await this.client.getAuthHeaders()),
      },
      signal: AbortSignal.timeout(clampedTimeout),
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              yield JSON.parse(line.slice(6)) as TransactionEvent;
            } catch (parseErr) {
              // Log malformed SSE data but keep the stream alive
              console.error("[SSE] Failed to parse event data:", parseErr);
            }
          }
        }
      }
    } finally {
      reader.cancel();
    }
  }
}
