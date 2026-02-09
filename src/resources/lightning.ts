import type { HttpClient } from "../client.js";
import type {
  CreateInvoiceParams,
  LightningInvoice,
  DecodedInvoice,
  LightningAddressInfo,
  LnurlInfo,
  Transaction,
} from "../types.js";
import { NeutronValidationError } from "../errors.js";

export class LightningResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a Lightning invoice to receive Bitcoin. Auto-confirms — ready to pay immediately.
   *
   * @example
   * const invoice = await neutron.lightning.createInvoice({ amountSats: 10000 });
   * console.log(invoice.invoice);   // "lnbc100u1p..."
   * console.log(invoice.qrPageUrl); // hosted QR code page
   *
   * @example
   * const invoice = await neutron.lightning.createInvoice({
   *   amountBtc: 0.001,
   *   memo: "Order #1234",
   *   extRefId: "order-1234",
   * });
   */
  async createInvoice(params: CreateInvoiceParams): Promise<LightningInvoice> {
    let btcAmount: number;

    if (params.amountSats !== undefined && params.amountBtc !== undefined) {
      throw new NeutronValidationError("Provide either amountSats or amountBtc, not both.");
    }
    if (params.amountSats !== undefined) {
      if (params.amountSats <= 0) throw new NeutronValidationError("amountSats must be positive.");
      btcAmount = params.amountSats / 100_000_000;
    } else if (params.amountBtc !== undefined) {
      if (params.amountBtc <= 0) throw new NeutronValidationError("amountBtc must be positive.");
      btcAmount = params.amountBtc;
    } else {
      throw new NeutronValidationError("Provide either amountSats or amountBtc.");
    }

    // Create
    const txn = await this.client.post<Transaction>(`/api/v2/transaction`, {
      extRefId: params.extRefId,
      sourceReq: { ccy: "BTC", method: "lightning", reqDetails: {} },
      destReq: {
        ccy: "BTC",
        method: "neutronpay",
        amtRequested: btcAmount,
        reqDetails: {},
      },
    });

    // Auto-confirm
    const confirmed = await this.client.put<Transaction>(
      `/api/v2/transaction/${txn.txnId}/confirm`
    );

    return {
      txnId: confirmed.txnId,
      invoice: confirmed.sourceReq?.reqDetails?.paymentRequest ?? "",
      qrPageUrl: confirmed.sourceReq?.reqDetails?.invoicePageUrl,
      amountBtc: btcAmount,
      amountSats: Math.round(btcAmount * 100_000_000),
      status: confirmed.txnState,
    };
  }

  /**
   * Pay a Lightning invoice (BOLT11).
   * Returns a quoted transaction — call `neutron.transactions.confirm()` to send.
   *
   * @example
   * const txn = await neutron.lightning.payInvoice("lnbc100u1p...");
   * // Review fees: txn.sourceReq.neutronpayFees
   * await neutron.transactions.confirm(txn.txnId);
   */
  async payInvoice(invoice: string, extRefId?: string): Promise<Transaction> {
    return this.client.post<Transaction>(`/api/v2/transaction`, {
      extRefId,
      sourceReq: { ccy: "BTC", method: "neutronpay" },
      destReq: {
        ccy: "BTC",
        method: "lightning",
        reqDetails: { paymentRequest: invoice },
      },
    });
  }

  /**
   * Send to a Lightning Address (user@domain.com).
   * Returns a quoted transaction — call `neutron.transactions.confirm()` to send.
   *
   * @example
   * const txn = await neutron.lightning.payAddress("alice@getalby.com", { amountSats: 5000 });
   * await neutron.transactions.confirm(txn.txnId);
   */
  async payAddress(
    address: string,
    params: { amountSats?: number; amountBtc?: number; extRefId?: string }
  ): Promise<Transaction> {
    let btcAmount: number;
    if (params.amountSats !== undefined) {
      btcAmount = params.amountSats / 100_000_000;
    } else if (params.amountBtc !== undefined) {
      btcAmount = params.amountBtc;
    } else {
      throw new NeutronValidationError("Provide either amountSats or amountBtc.");
    }

    return this.client.post<Transaction>(`/api/v2/transaction`, {
      extRefId: params.extRefId,
      sourceReq: { ccy: "BTC", method: "neutronpay", amtRequested: btcAmount },
      destReq: {
        ccy: "BTC",
        method: "lnurl",
        reqDetails: { lnurl: address },
      },
    });
  }

  /**
   * Decode a BOLT11 invoice to inspect it before paying.
   * Returns amount, expiry, destination node, description, and payment status.
   */
  async decodeInvoice(invoice: string): Promise<DecodedInvoice> {
    return this.client.get<DecodedInvoice>(
      `/api/v2/lightning/invoice?invoice=${encodeURIComponent(invoice)}`
    );
  }

  /**
   * Resolve a Lightning Address (user@domain.com) to check if it exists
   * and get min/max sendable amounts.
   *
   * @param amountMsat Optional: get a specific invoice for this amount (in millisatoshis)
   */
  async resolveAddress(address: string, amountMsat?: number): Promise<LightningAddressInfo> {
    let path = `/api/v2/lightning/resolve-ln-address?lnAddress=${encodeURIComponent(address)}`;
    if (amountMsat !== undefined) path += `&amount=${amountMsat}`;
    return this.client.get<LightningAddressInfo>(path);
  }

  /**
   * Resolve an LNURL string to see its type (pay/withdraw/channel) and parameters.
   */
  async resolveLnurl(lnurl: string): Promise<LnurlInfo> {
    return this.client.get<LnurlInfo>(
      `/api/v2/lightning/resolve-lnurl?lnurl=${encodeURIComponent(lnurl)}`
    );
  }
}
