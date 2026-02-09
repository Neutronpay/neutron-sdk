import type { HttpClient } from "../client.js";
import type { Account, Wallet } from "../types.js";

export class AccountResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Get account info: display name, status, country, timezone.
   */
  async get(): Promise<Account> {
    const accountId = await this.client.ensureAuthAndGetAccountId();
    const res = await this.client.get(`/api/v2/account/${accountId}`);
    return (res.data ?? res) as Account;
  }

  /**
   * List all wallets with balances (BTC, USDT, fiat).
   */
  async wallets(): Promise<Wallet[]> {
    const accountId = await this.client.ensureAuthAndGetAccountId();
    const res = await this.client.get(`/api/v2/account/${accountId}/wallet/`);
    return res.data ?? res;
  }

  /**
   * Get a specific wallet by ID.
   */
  async wallet(walletId: string): Promise<Wallet> {
    const accountId = await this.client.ensureAuthAndGetAccountId();
    const res = await this.client.get(`/api/v2/account/${accountId}/wallet/${walletId}`);
    return (res.data ?? res) as Wallet;
  }

  /**
   * Get your Bitcoin on-chain deposit address (static, reusable).
   */
  async btcAddress(): Promise<{ address: string }> {
    const raw = await this.client.get(`/api/v2/account/onchain-address`);
    const data = raw?.data ?? raw;
    return { address: data.staticOnchainAddress };
  }

  /**
   * Get your USDT deposit address.
   * @param chain "TRON" (default, recommended) or "ETH"
   */
  async usdtAddress(chain: "TRON" | "ETH" = "TRON"): Promise<{ address: string; chain: string }> {
    const raw = await this.client.get(
      `/api/v2/account/stablecoin-onchain-address?walletCcy=USDT&chainId=${chain}`
    );
    const data = raw?.data ?? raw;
    return {
      address: data.staticStablecoinOnchainAddress || data.staticOnchainAddress,
      chain,
    };
  }
}
