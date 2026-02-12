# Neutron SDK

[![npm version](https://img.shields.io/npm/v/neutron-sdk.svg)](https://www.npmjs.com/package/neutron-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

The official TypeScript/Node.js SDK for [Neutron](https://neutron.me) — Bitcoin Lightning, stablecoins, and fiat payments through a single API.

## Install

```bash
npm install neutron-sdk
```

## Prerequisites

Sign up at [portal.neutron.me](https://portal.neutron.me) to get your API key and secret.

## Quick Start

```typescript
import { Neutron } from "neutron-sdk";

const neutron = new Neutron({
  apiKey: process.env.NEUTRON_API_KEY!,
  apiSecret: process.env.NEUTRON_API_SECRET!,
});

// Check your balances
const wallets = await neutron.account.wallets();
console.log(wallets); // [{ ccy: "BTC", availableBalance: 0.05 }, ...]

// Create a Lightning invoice
const invoice = await neutron.lightning.createInvoice({ amountSats: 10000 });
console.log(invoice.invoice); // "lnbc100u1p..."
```

That's it. Auth, token refresh, and retries are handled automatically.

---

## Resources

The SDK is organized into resources, like Stripe's SDK:

```
neutron.account       // Account info, wallets, deposit addresses
neutron.transactions  // Create, confirm, list, track payments
neutron.lightning     // Lightning invoices, payments, utilities
neutron.webhooks      // Webhook management
neutron.rates         // Exchange rates
neutron.fiat          // Fiat payouts and bank lookups
```

---

## Usage Examples

### Receive Bitcoin via Lightning

```typescript
const invoice = await neutron.lightning.createInvoice({
  amountSats: 50000,         // 50,000 sats
  memo: "Order #1234",       // shown to payer
  extRefId: "order-1234",    // your tracking ID
});

// Give this to your customer
console.log(invoice.invoice);    // BOLT11 string
console.log(invoice.qrPageUrl);  // hosted QR code page
console.log(invoice.txnId);      // track payment status
```

### Send to a Lightning Address

```typescript
const txn = await neutron.lightning.payAddress("alice@getalby.com", {
  amountSats: 5000,
});
// Review the quote
console.log(txn.sourceReq.neutronpayFees); // fees in BTC

// Confirm to send
await neutron.transactions.confirm(txn.txnId);
```

### Pay a Lightning Invoice

```typescript
const txn = await neutron.lightning.payInvoice("lnbc100u1p...");
await neutron.transactions.confirm(txn.txnId);
```

### Check Wallet Balances

```typescript
const wallets = await neutron.account.wallets();
for (const w of wallets) {
  console.log(`${w.ccy}: ${w.availableBalance}`);
}
```

### Convert BTC to USDT

```typescript
const txn = await neutron.transactions.create({
  sourceReq: { ccy: "BTC", method: "neutronpay", amtRequested: 0.001, reqDetails: {} },
  destReq: { ccy: "USDT", method: "neutronpay", reqDetails: {} },
});
console.log(`Rate: ${txn.fxRate}`);
await neutron.transactions.confirm(txn.txnId);
```

### Send Bitcoin On-Chain

```typescript
const txn = await neutron.transactions.create({
  sourceReq: { ccy: "BTC", method: "neutronpay" },
  destReq: {
    ccy: "BTC",
    method: "on-chain",
    amtRequested: 0.005,
    reqDetails: { address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  },
});
await neutron.transactions.confirm(txn.txnId);
```

### Get Deposit Addresses

```typescript
const btc = await neutron.account.btcAddress();
console.log(btc.address);  // "bc1q..." or "3M5A..."

const usdt = await neutron.account.usdtAddress("TRON");
console.log(usdt.address);  // "T..."
```

### Fiat Payout (Bank Transfer)

```typescript
// Look up bank codes first
const banks = await neutron.fiat.institutions("VN");

// Send VND to a bank account
const txn = await neutron.fiat.payout({
  sourceCcy: "BTC",
  sourceAmount: 0.001,
  destCcy: "VND",
  destMethod: "vnd-instant",
  bankAcctNum: "0123456789",
  institutionCode: "970422",
  recipientName: "LE VAN A",
  countryCode: "VN",
});
await neutron.transactions.confirm(txn.txnId);
```

### Exchange Rates

```typescript
const rates = await neutron.rates.get();
console.log(rates); // { BTCUSD: 97500, BTCVND: 2437500000, ... }
```

### Webhooks

```typescript
// Create
const webhook = await neutron.webhooks.create({
  callback: "https://myapp.com/webhooks/neutron",
  secret: "my-webhook-secret",
});

// List
const hooks = await neutron.webhooks.list();

// Update
await neutron.webhooks.update(webhook.id, { callback: "https://myapp.com/v2/webhooks" });

// Delete
await neutron.webhooks.delete(webhook.id);
```

## Verify Webhook Signatures

One-liner verification — no client instance needed:

```typescript
import { Neutron } from "neutron-sdk";

// Express example
app.post("/webhooks/neutron", express.raw({ type: "application/json" }), (req, res) => {
  try {
    const event = Neutron.verifyWebhook(
      req.body,
      req.headers["x-neutronpay-signature"],
      "my-webhook-secret"
    );
    res.status(200).send("OK");

    // Event is verified — safe to use
    if (event.txnState === "completed") {
      fulfillOrder(event.extRefId);
    }
  } catch (err) {
    res.status(401).send("Invalid signature");
  }
});
```

## Wait for Transaction Completion

```typescript
const txn = await neutron.lightning.payInvoice("lnbc...");
await neutron.transactions.confirm(txn.txnId);

// Poll until done (with state change callbacks)
const result = await neutron.transactions.waitForCompletion(txn.txnId, {
  intervalMs: 2000,
  timeoutMs: 60000,
  onStateChange: (state) => console.log("State:", state),
});
console.log(result.txnState); // "completed"
```

## Utility Helpers

```typescript
import { satsToBtc, btcToSats, formatSats, formatBtc } from "neutron-sdk";

satsToBtc(10000);      // 0.0001
btcToSats(0.0001);     // 10000
formatSats(1500000);   // "1,500,000 sats"
formatBtc(0.00015);    // "0.00015000 BTC"
```

## Constants

```typescript
import { Currency, PaymentMethod, TransactionStates, Chain } from "neutron-sdk";

// Use in transaction creation for type safety
const txn = await neutron.transactions.create({
  sourceReq: { ccy: Currency.BTC, method: PaymentMethod.NEUTRON, amtRequested: 0.001, reqDetails: {} },
  destReq: { ccy: Currency.USDT, method: PaymentMethod.NEUTRON, reqDetails: {} },
});

// Check states
if (txn.txnState === TransactionStates.COMPLETED) { ... }

// USDT chains
const { address } = await neutron.account.usdtAddress(Chain.TRON);
```

## Error Handling

```typescript
import { NeutronApiError, NeutronAuthError, NeutronValidationError } from "neutron-sdk";

try {
  await neutron.lightning.createInvoice({ amountSats: 10000 });
} catch (err) {
  if (err instanceof NeutronApiError) {
    console.log(err.status);       // 400, 401, 429, etc.
    console.log(err.code);         // Neutron error code
    console.log(err.message);      // Human-readable message
    console.log(err.isRetryable);  // true for 5xx/429
    console.log(err.isRateLimited); // true for 429
  } else if (err instanceof NeutronAuthError) {
    console.log("Check your API credentials");
  } else if (err instanceof NeutronValidationError) {
    console.log("Invalid parameters:", err.message);
  }
}
```

---

## Configuration

```typescript
const neutron = new Neutron({
  apiKey: "your-api-key",       // Required
  apiSecret: "your-api-secret", // Required
  baseUrl: "https://api.neutron.me",  // Custom API URL (default: api.neutron.me)
  timeout: 15000,               // Request timeout in ms (default: 30000)
  maxRetries: 3,                // Retry attempts for 5xx/429 (default: 2)
  debug: true,                  // Log requests to stderr
});
```

---

## Key Concepts

- **Amounts are in BTC**, not satoshis. `0.0001` BTC = 10,000 sats.
- **Two-step flow**: `.create()` returns a quote → `.confirm()` executes it.
- **Set amount on one side only** — `sourceReq` OR `destReq`, not both.
- **`createInvoice()` auto-confirms** — no second step needed for receiving.
- **KYC only for fiat payouts**. Bitcoin (Lightning + on-chain), stablecoins (USDT on TRON/ETH), and swaps require **no KYC**.
- **Token management is automatic** — the SDK authenticates on first request and refreshes as needed.

---

## Supported Payment Methods

| Type | Methods |
|------|---------|
| **Bitcoin Lightning** | Bolt11 invoices, Lightning Addresses, LNURL |
| **Bitcoin On-Chain** | Standard BTC transactions |
| **Stablecoins** | USDT on TRON (TRC-20) and Ethereum (ERC-20) |
| **Fiat Payouts** | Bank transfers (VND, USD, etc.) |
| **Internal** | Wallet-to-wallet swaps (BTC ↔ USDT ↔ fiat) |

---

## Links

- **Documentation**: [docs.neutron.me](https://docs.neutron.me)
- **API Reference**: [docs.neutron.me/reference](https://docs.neutron.me/reference/overview)
- **MCP Server**: [neutron-mcp](https://www.npmjs.com/package/neutron-mcp) (for AI agents)
- **Contact**: support@neutron.me

## License

MIT
