-- No email code at sign-up any more (2026-10-22): accounts made at guest checkout count as confirmed too, so they
-- get monthly vouchers like everyone else. They still sign in only after setting a password.
UPDATE "shop_customers" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL AND "passwordHash" = '';
