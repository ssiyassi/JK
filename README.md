# Jentis Kitchen — Operations

Internal app for orders, inventory (Babi Manis, Babi Asin, Sapi Manis, Sapi Asin), production, stock adjustments,
resellers and reseller sales/rewards.

- Stack: Next.js 16 on Cloudflare Workers (OpenNext), Cloudflare D1, Cloudflare Access.
- Deploy, migrate, roll back: see **DEPLOYMENT.md**. What changed and why: **CHANGES.md**.

## Local development
```bash
npm install
cp .dev.vars.example .dev.vars && cp .dev.vars.example .env.local
npm run db:migrate:local      # then load data as in DEPLOYMENT.md step 5
npm run dev                   # http://localhost:3000
npm test                      # business-logic tests
```

## Rules
- Business numbers (stock, box counts, sales) are computed by code/SQL in `src/lib/core`, never estimated.
- Every stock change writes a `stock_movement_history` row in the same transaction.
- Schema changes go in a new numbered file in `migrations/` and are applied to preview before production.
- Never commit `.dev.vars`, `.env*`, `backups/`, `data-export/` or database files.
