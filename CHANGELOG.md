# Changelog

## 0.1.0 (2026-02-09)

Initial release.

### Features

- **Account**: `get()`, `wallets()`, `wallet()`, `btcAddress()`, `usdtAddress()`
- **Transactions**: `create()`, `confirm()`, `get()`, `list()`, `cancel()`, `waitForCompletion()`
- **Lightning**: `createInvoice()`, `payInvoice()`, `payAddress()`, `decodeInvoice()`, `resolveAddress()`, `resolveLnurl()`
- **Webhooks**: `create()`, `list()`, `update()`, `delete()`
- **Rates**: `get()`
- **Fiat**: `institutions()`, `payout()`
- Auto-authentication with token refresh
- Exponential backoff retry on 5xx/429
- Typed errors: `NeutronApiError`, `NeutronAuthError`, `NeutronValidationError`, `NeutronTimeoutError`
- Zero runtime dependencies (Node.js 18+ built-ins only)
- ESM + CJS + TypeScript declarations
