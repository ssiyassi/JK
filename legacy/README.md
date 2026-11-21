# Legacy (laptop-only) files — not used by the deployed app

- `prisma/schema.prisma`: the original Prisma schema. The live schema is now `migrations/0001_existing_schema.sql` (identical tables).
- `prisma/seed*.ts`: **destructive** — `seed-real-data.ts` and `seed-all-orders.ts` delete every order, reseller,
  stock movement and inventory row before inserting. They no longer run (Prisma is not installed) and must
  never be pointed at the production database. Kept only for reference.
