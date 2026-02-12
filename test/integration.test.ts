/**
 * Neutron SDK — Full Integration Test Suite
 * Tests every endpoint against the live API.
 *
 * Usage:
 *   NEUTRON_API_KEY=xxx NEUTRON_API_SECRET=yyy npx tsx test/integration.test.ts
 *
 * Or with .env:
 *   source ~/.openclaw/.env && npx tsx test/integration.test.ts
 */

import { Neutron } from "../src/index.js";

const apiKey = process.env.NEUTRON_API_KEY;
const apiSecret = process.env.NEUTRON_API_SECRET;

if (!apiKey || !apiSecret) {
  console.error("❌ Set NEUTRON_API_KEY and NEUTRON_API_SECRET");
  process.exit(1);
}

const neutron = new Neutron({ apiKey, apiSecret, debug: false });

let passed = 0;
let failed = 0;
const results: { name: string; status: string; detail?: string }[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    results.push({ name, status: "✅ PASS" });
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failed++;
    const detail = err.message || String(err);
    results.push({ name, status: "❌ FAIL", detail });
    console.log(`  ❌ ${name} — ${detail}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ── Tests ──────────────────────────────────────────────

async function run() {
  console.log("\n🔬 Neutron SDK Integration Tests\n");
  console.log("═══════════════════════════════════════\n");

  // ── 1. Authentication ──
  console.log("📋 Authentication");
  await test("Authenticate and get token", async () => {
    const auth = await neutron.authenticate();
    assert(!!auth.accountId, "Missing accountId");
    assert(!!auth.accessToken, "Missing accessToken");
  });

  // ── 2. Account ──
  console.log("\n📋 Account");
  await test("Get account details", async () => {
    const account = await neutron.account.get() as any;
    assert(!!account.id || !!account.accountId, "Missing account id");
    assert(account.accountStatus === "ACTIVE" || account.status === "ACTIVE", `Unexpected status`);
  });

  await test("List wallets", async () => {
    const wallets = await neutron.account.wallets();
    assert(Array.isArray(wallets), "Wallets should be an array");
    assert(wallets.length > 0, "Should have at least 1 wallet");
    const btc = wallets.find((w: any) => w.ccy === "BTC");
    assert(!!btc, "Should have BTC wallet");
  });

  await test("Get single wallet", async () => {
    const wallets = await neutron.account.wallets();
    const btcWallet = wallets.find((w: any) => w.ccy === "BTC") as any;
    const walletId = btcWallet.id || btcWallet.walletId;
    const wallet = await neutron.account.wallet(walletId) as any;
    assert(wallet.ccy === "BTC", "Should be BTC wallet");
    assert(typeof wallet.amount === "number" || typeof wallet.balance === "number", "Should have balance");
  });

  await test("Get BTC on-chain address", async () => {
    const addr = await neutron.account.btcAddress();
    assert(!!addr.address, "Missing on-chain address");
    assert(addr.address.length > 20, "Address too short");
  });

  await test("Get USDT address (TRON)", async () => {
    const addr = await neutron.account.usdtAddress("TRON");
    assert(!!addr.address, "Missing stablecoin address");
  });

  await test("Get USDT address (ETH)", async () => {
    const addr = await neutron.account.usdtAddress("ETH");
    assert(!!addr.address, "Missing stablecoin address");
  });

  // ── 3. Exchange Rates ──
  console.log("\n📋 Exchange Rates");
  await test("Get exchange rates", async () => {
    const rates = await neutron.rates.get();
    assert(!!rates, "Missing rates");
    // Rates should have BTC pairs
    const rateStr = JSON.stringify(rates);
    assert(rateStr.includes("BTC") || rateStr.includes("btc"), "Should include BTC rates");
  });

  // ── 4. Transactions ──
  console.log("\n📋 Transactions");
  await test("List transactions", async () => {
    const txns = await neutron.transactions.list({ limit: 5 });
    assert(Array.isArray(txns), "Should return array");
  });

  await test("Get single transaction (from list)", async () => {
    const txns = await neutron.transactions.list({ limit: 1 });
    if (txns.length > 0) {
      const txn = await neutron.transactions.get(txns[0].txnId);
      assert(!!txn.txnId, "Should have txnId");
      assert(!!txn.txnState, "Should have txnState");
    }
  });

  // ── 5. Lightning Receive (create invoice) ──
  console.log("\n📋 Lightning — Receive");
  let invoiceTxnId: string | null = null;

  await test("Create Lightning invoice (100 sats)", async () => {
    const invoice = await neutron.lightning.createInvoice({ amountSats: 100 });
    assert(!!invoice.txnId, "Missing txnId");
    assert(!!invoice.invoice, "Missing BOLT11 invoice string");
    assert(invoice.invoice.startsWith("lnbc"), "Invoice should start with lnbc");
    assert(invoice.amountSats === 100, `Expected 100 sats, got ${invoice.amountSats}`);
    invoiceTxnId = invoice.txnId;
  });

  await test("Create Lightning invoice (amountBtc)", async () => {
    const invoice = await neutron.lightning.createInvoice({ amountBtc: 0.00000200 });
    assert(!!invoice.invoice, "Missing invoice");
    assert(invoice.amountSats === 200, `Expected 200 sats, got ${invoice.amountSats}`);
  });

  await test("Verify invoice transaction status", async () => {
    if (!invoiceTxnId) throw new Error("No invoice txnId from previous test");
    const txn = await neutron.transactions.get(invoiceTxnId);
    assert(txn.txnState === "srccreated", `Expected srccreated, got ${txn.txnState}`);
  });

  // ── 6. Lightning Send (pay address) ──
  console.log("\n📋 Lightning — Send to Address");
  let payAddressTxnId: string | null = null;

  await test("Create Lightning Address payment quote (100 sats)", async () => {
    const txn = await neutron.lightning.payAddress("ravenraven@neutron.me", { amountSats: 100 });
    assert(!!txn.txnId, "Missing txnId");
    assert(txn.txnState === "quoted", `Expected quoted, got ${txn.txnState}`);
    payAddressTxnId = txn.txnId;
  });

  await test("Confirm Lightning Address payment", async () => {
    if (!payAddressTxnId) throw new Error("No payAddress txnId");
    const confirmed = await neutron.transactions.confirm(payAddressTxnId);
    assert(!!confirmed.txnId, "Missing txnId after confirm");
    // Should move past quoted state
    assert(confirmed.txnState !== "quoted", `Should not still be quoted, got ${confirmed.txnState}`);
  });

  // ── 7. BTC→USDT Swap ──
  console.log("\n📋 Stablecoin Swap");
  await test("Create BTC→USDT swap quote", async () => {
    const txn = await neutron.transactions.create({
      sourceReq: { ccy: "BTC", method: "neutronpay", amtRequested: 0.00000100, reqDetails: {} },
      destReq: { ccy: "USDT", method: "neutronpay", reqDetails: {} },
    });
    assert(!!txn.txnId, "Missing txnId");
    assert(txn.txnState === "quoted", `Expected quoted, got ${txn.txnState}`);
    // Don't confirm — just test quote creation
  });

  // ── 8. Fiat ──
  console.log("\n📋 Fiat");
  await test("Get fiat institutions (Vietnam)", async () => {
    const result = await neutron.fiat.institutions("VN") as any;
    const banks = Array.isArray(result) ? result : result.banks;
    assert(Array.isArray(banks), "Should return array of banks");
    assert(banks.length > 0, "Should have Vietnamese banks");
    const bank = banks[0];
    assert(!!bank.institutionCode || !!bank.name, "Bank should have code or name");
  });

  // ── 9. Webhooks (full CRUD) ──
  console.log("\n📋 Webhooks");
  let webhookId: string | null = null;

  await test("List webhooks", async () => {
    const webhooks = await neutron.webhooks.list();
    assert(Array.isArray(webhooks), "Should return array");
  });

  await test("Create webhook", async () => {
    const wh = await neutron.webhooks.create({
      callback: "https://example.com/webhook-test",
      secret: "test-secret-123",
    });
    assert(!!wh.id, "Missing webhook id");
    webhookId = wh.id;
  });

  await test("Update webhook", async () => {
    if (!webhookId) throw new Error("No webhook id");
    const result = await neutron.webhooks.update(webhookId, {
      callback: "https://example.com/webhook-updated",
      secret: "updated-secret-456",
    });
    assert(!!result, "Update should return response");
  });

  await test("Delete webhook", async () => {
    if (!webhookId) throw new Error("No webhook id");
    await neutron.webhooks.delete(webhookId);
    // Verify it's gone
    const webhooks = await neutron.webhooks.list();
    const found = webhooks.find((w: any) => w.id === webhookId);
    assert(!found, "Webhook should be deleted");
  });

  // ── 10. Cancel (deprecated) ──
  console.log("\n📋 Deprecated Methods");
  await test("transactions.cancel() throws helpful error", async () => {
    let threw = false;
    try {
      await neutron.transactions.cancel("fake-id");
    } catch (err: any) {
      threw = true;
      assert(err.message.includes("not available"), `Expected 'not available' error, got: ${err.message}`);
    }
    assert(threw, "cancel() should throw");
  });

  // ── Summary ──
  console.log("\n═══════════════════════════════════════");
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results.filter(r => r.status.includes("FAIL")).forEach(r => {
      console.log(`  • ${r.name}: ${r.detail}`);
    });
    console.log();
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
