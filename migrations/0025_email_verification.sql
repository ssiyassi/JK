-- Migration 0025 (additive only): new customers confirm their email with a 6-digit code before they get the welcome
-- voucher. Accounts that existed before this migration count as confirmed (they already received their voucher).
ALTER TABLE "shop_customers" ADD COLUMN "emailVerifiedAt" INTEGER;
UPDATE "shop_customers" SET "emailVerifiedAt" = "createdAt" WHERE "emailVerifiedAt" IS NULL;

-- Codes emailed to customers. Only a hash of each code is stored; a new code replaces the older unused ones.
CREATE TABLE IF NOT EXISTS "shop_email_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" INTEGER,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_email_codes_customer_idx" ON "shop_email_codes"("customerId", "createdAt");
