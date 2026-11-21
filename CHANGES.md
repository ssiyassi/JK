# Changes for Cloudflare deployment (v0.2.0)

All business rules are preserved: products, Payday Promo box counting, order ID format, inventory movements,
reseller hierarchy and the sales/reward report. The database schema is unchanged; one table was added.

## Why the data layer changed
The app now talks to Cloudflare D1 directly instead of through Prisma. D1 is SQLite, so the tables, columns and
stored values are identical (dates stay integer milliseconds). Prisma's D1 adapter cannot run several writes as one
transaction, and that is exactly what "never apply an order or stock change twice" needs. D1's own batch API can.
The business logic now lives in `src/lib/core/` and is covered by tests that run without Cloudflare.

## Files
| Change | Files |
|---|---|
| New business logic (D1) | `src/lib/core/{d1,time,inventory,orders,resellers}.ts` |
| Server glue: D1 binding, logs, errors | `src/lib/server.ts` |
| Login check (Cloudflare Access token) | `src/middleware.ts` |
| Retry-safe form submissions | `src/lib/client/useIdempotencyKey.ts`; `OrderForm`, `EditOrderForm`, `ProductionForm`, `StockAdjustmentForm` |
| API routes rewritten on the core (same URLs, same responses) | `src/app/api/**/route.ts` |
| Health check | `src/app/api/health/route.ts` |
| Pages read data directly (no `localhost:3000`) | `page.tsx`, `inventory/*`, `orders/page.tsx`, `orders/[id]/edit`, `my-resellers` |
| Error page instead of fake numbers | `src/app/error.tsx` |
| Schema as D1 migrations | `migrations/0001_existing_schema.sql` (exact copy), `0002_operation_keys.sql` (additive) |
| Data export and verification | `scripts/sqlite_to_d1.py`, `scripts/reconcile.sql` |
| Cloudflare config | `wrangler.jsonc`, `open-next.config.ts`, `next.config.mjs`, `package.json`, `.dev.vars.example` |
| Tests | `tests/core.test.ts`, `tests/sqlite-d1.ts` |
| Removed (debug / dead code) | `api/clear-stock-movement`, `api/force-negative-inventory`, `api/set-negative-inventory`, `api/test-new-order`, `/test-inventory`, `orders/page-old.tsx`, `orders/page-new.tsx`, `src/lib/prisma.ts` |
| Moved, no longer runnable | `prisma/` → `legacy/prisma/` (schema reference and the destructive seed scripts) |

## Behaviour changes (all deliberate fixes)
1. **Login required** for every page and API.
2. **Retries are safe.** Creating an order, editing, production and adjustments carry a submission key; a repeated
   request returns the first result instead of applying again. Cancelling returns stock exactly once.
3. **Atomic writes.** The order, the stock change and the movement log are written together or not at all.
4. **Order IDs cannot collide.** The daily sequence is computed inside the transaction (next number after the
   highest that day).
5. **Edits use the stored order**, not quantities sent by the browser. Quantities of a cancelled order can no longer
   be edited (other fields still can).
6. **Jakarta time everywhere** (order ID date, today/tomorrow, reseller week, reward period). The results match the
   laptop exactly. Without this, 11 of your existing 429 orders (created 00:00–07:00 WIB) would have received the
   previous day's date in their ID on Cloudflare.
7. **The inventory row is selected explicitly** (`id = 'current'`); the old `'initial'` row is kept but never used.
8. **No placeholder data.** Pages show an error instead of fake stock (10/15/20/25) or zeros. Zeros on the adjustment
   form could have wiped stock on submit.
9. Stock adjustment: a blank field keeps the current value (previously an error).
10. Reward period Jan & Feb includes 29 February in leap years.
11. Reseller report week range shows the actual Monday (the laptop showed the Sunday before). The CSV header names the
    real period (it was hard-coded to "September & October"). CSV values are escaped.
12. Error responses no longer send internal error details to the browser (they go to the logs).

## Verified here (not on Cloudflare)
- 11 automated tests pass: order create/edit/cancel, retries, atomic rollback, production, adjustment, box counter,
  Jakarta dates, reseller report, reseller delete rule.
- Your real data was exported and loaded into a fresh database built from the migrations. All four tables are
  identical row-for-row and in value types.
- The reseller sales report from the new code (running in UTC, as on Cloudflare) is identical to the original code
  (running in WIB, as on the laptop) on your real data, for 47 dates from Aug 2025 to Oct 2026.
- A full order lifecycle ran on a copy of your real data (stock 58 → 55 → 58, cancel applied once).
- All server TypeScript files parse.

## Not verified yet (needs your machine or Cloudflare)
- `npm install`, `next build` and the OpenNext build. Nothing was installed here, because the sandbox has no network.
- That the OpenNext adapter runs this Next.js 14.2 app; if it does not, a Next.js upgrade will be proposed separately.
- D1 itself: real batch behaviour, the unique-constraint message text, and the Worker size limit.
- Access login flow, and the middleware reading `CF_ACCESS_*` from the Worker environment.
- Clicking through the UI (no browser here). The smoke test in DEPLOYMENT.md covers this.

## Pre-existing data observations (not changed)
- `initial` inventory + the sum of all logged movements ≠ `current` inventory. The movement log was partly rewritten
  by the old debug endpoints and early imports. `current` matches the latest movement and is treated as correct.
- 4 orders are cancelled but only 3 `CANCEL_ORDER` movements exist.
- Four reseller names (Alang, Jacky, Mami, Veronica) are registered twice without a parent. "Vivi" exists under two
  parents and is merged in the sales report, as before.
