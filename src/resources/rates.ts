import type { HttpClient } from "../client.js";
import type { ExchangeRates } from "../types.js";

export class RatesResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get current BTC exchange rates against all supported currencies.
   *
   * @example
   * const rates = await neutron.rates.get();
   * console.log(rates); // { BTCUSD: 97500, BTCVND: 2437500000, ... }
   */
  async get(): Promise<ExchangeRates> {
    const res = await this.client.get(`/api/v2/rate`);
    return res.data ?? res;
  }
}
