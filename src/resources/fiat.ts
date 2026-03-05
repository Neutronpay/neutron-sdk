import type { HttpClient } from "../client.js";
import type { FiatInstitution, Transaction, SourceOfFunds } from "../types.js";
import { sanitizePathParam } from "../sanitize.js";

export interface FiatPayoutParams {
  /** Source currency (e.g. "BTC") */
  sourceCcy: string;
  /** Amount from source (in BTC for Bitcoin) */
  sourceAmount: number;
  /** Destination fiat currency (e.g. "VND") */
  destCcy: string;
  /** Payment method (e.g. "vnd-instant") */
  destMethod: string;
  /** Bank account number */
  bankAcctNum: string;
  /** Bank code from `neutron.fiat.institutions()` */
  institutionCode: string;
  /** Recipient legal full name */
  recipientName: string;
  /** Recipient country code (e.g. "VN") */
  countryCode: string;
  /** Recipient address (optional, defaults to "N/A") */
  recipientAddress?: string;
  /** Recipient phone in E.164 format — MUST include country prefix (e.g. "+628123456789" for Indonesia, "+84912345678" for Vietnam). Omit or pass "N/A" if unknown. */
  recipientPhone?: string;
  /** Sender legal full name — use beneficialAccountName || legalFullName || displayName from account */
  senderName?: string;
  /** Sender country code — pulled from account if not provided */
  senderCountryCode?: string;
  /** Sender address — pulled from account KYC if not provided */
  senderAddress?: string;
  /** Sender phone in E.164 format — MUST include country prefix (e.g. "+628123456789" for Indonesia, "+84912345678" for Vietnam). Omit or pass "N/A" if unknown. */
  senderPhone?: string;
  /** "individual" or "business" (default: "individual") */
  kycType?: "individual" | "business";
  /** Source of funds declaration */
  sourceOfFunds?: SourceOfFunds;
  /** Your reference ID */
  extRefId?: string;
}

export class FiatResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * List banks and financial institutions for a country.
   * Returns institution codes needed for fiat payouts.
   *
   * @example
   * const banks = await neutron.fiat.institutions("VN");
   * // [{ code: "970422", name: "MB Bank" }, ...]
   */
  async institutions(countryCode: string): Promise<FiatInstitution[]> {
    sanitizePathParam(countryCode, "countryCode");
    const res = await this.client.get(
      `/api/v2/reference/fiat-institution/by-country/${countryCode}`
    );
    return res.data ?? res;
  }

  /**
   * Create a fiat payout transaction. KYC is required only for fiat payouts — not for
   * Bitcoin, stablecoins, or swaps. Handles KYC and source of funds automatically.
   * Returns a quoted transaction — call `neutron.transactions.confirm()` to execute.
   *
   * @example
   * const txn = await neutron.fiat.payout({
   *   sourceCcy: "BTC",
   *   sourceAmount: 0.001,
   *   destCcy: "VND",
   *   destMethod: "vnd-instant",
   *   bankAcctNum: "0123456789",
   *   institutionCode: "970422",
   *   recipientName: "LE VAN A",
   *   countryCode: "VN",
   * });
   * // Review rate: txn.fxRate
   * await neutron.transactions.confirm(txn.txnId);
   */
  async payout(params: FiatPayoutParams): Promise<Transaction> {
    // Normalise phone numbers to E.164 format
    const countryPrefixes: Record<string, string> = {
      VN: "+84", ID: "+62", TH: "+66", SG: "+65", MY: "+60", PH: "+63",
    };
    const normalisePhone = (phone: string | undefined, country: string): string => {
      if (!phone || phone === "N/A") return "N/A";
      if (phone.startsWith("+")) return phone;
      const prefix = countryPrefixes[country.toUpperCase()];
      if (prefix) return prefix + phone.replace(/^0/, "");
      return phone;
    };
    const destCountry = params.countryCode?.toUpperCase() || "VN";
    const srcCountry = params.senderCountryCode?.toUpperCase() || destCountry;
    params = {
      ...params,
      recipientPhone: normalisePhone(params.recipientPhone, destCountry),
      senderPhone: normalisePhone(params.senderPhone, srcCountry),
    };
    return this.client.post<Transaction>(`/api/v2/transaction`, {
      extRefId: params.extRefId,
      sourceReq: {
        ccy: params.sourceCcy,
        method: "neutronpay",
        amtRequested: params.sourceAmount,
        reqDetails: {},
        kyc: {
          type: params.kycType || "individual",
          details: {
            legalFullName: params.senderName || "Account Holder",
            countryCode: params.senderCountryCode || params.countryCode || "VN",
            address1: params.senderAddress || "N/A",
            contactNumber: params.senderPhone || "N/A",
          },
        },
      },
      destReq: {
        ccy: params.destCcy,
        method: params.destMethod,
        reqDetails: {
          bankAcctNum: params.bankAcctNum,
          institutionCode: params.institutionCode,
        },
        kyc: {
          type: params.kycType || "individual",
          details: {
            legalFullName: params.recipientName,
            countryCode: params.countryCode,
            address1: params.recipientAddress || "N/A",
            contactNumber: params.recipientPhone || "N/A",
          },
        },
      },
      sourceOfFunds: params.sourceOfFunds ?? {
        purpose: 1,
        source: 5,
        relationship: 3,
      },
    });
  }
}
