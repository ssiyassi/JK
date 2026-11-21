-- Voucher engine: vouchers the owner creates in the admin (Website → Vouchers), next to the automatic
-- WELCOME / MONTHLY / REFERRAL vouchers in shop_vouchers (unchanged).
--   GENERAL: one code everyone can use (e.g. JENTIS10)
--   UNIQUE:  a batch of single-use codes PREFIX + 6 random characters (e.g. sold to a company)
--   BLAST:   one single-use code per email address, emailed; only the account with that email can use it
-- A use is an order holding the voucher (shop_orders.voucherActive = 1); cancelling the order frees the use.
CREATE TABLE IF NOT EXISTS "shop_voucher_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,                 -- shown to customers (account page, email)
    "type" TEXT NOT NULL,                 -- GENERAL | UNIQUE | BLAST
    "discountType" TEXT NOT NULL,         -- PERCENT | FIXED
    "discountValue" INTEGER NOT NULL,     -- percent (1-100) or Rupiah
    "capAmount" INTEGER,                  -- PERCENT only: max discount in Rupiah; NULL = no cap
    "minOrder" INTEGER NOT NULL DEFAULT 0, -- product subtotal needed; 0 = no minimum
    "startsAt" INTEGER NOT NULL,          -- first millisecond of the start day (WIB)
    "endsAt" INTEGER NOT NULL,            -- last millisecond of the end day (WIB)
    "quota" INTEGER,                      -- total uses; NULL = unlimited
    "perCustomerLimit" INTEGER,           -- uses per customer within the period; NULL = unlimited
    "perCustomerDailyLimit" INTEGER,      -- uses per customer per WIB day; NULL = unlimited
    "prefix" TEXT,                        -- UNIQUE / BLAST: code prefix (also the ZIP password for UNIQUE)
    "disabledAt" INTEGER,                 -- NULL = active
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "shop_voucher_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,                         -- BLAST only: the account email that may use it
    "emailedAt" INTEGER,                  -- BLAST only
    "disabledAt" INTEGER,                 -- NULL = active
    "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_voucher_codes_code_key" ON "shop_voucher_codes"("code");
CREATE INDEX IF NOT EXISTS "shop_voucher_codes_campaign_idx" ON "shop_voucher_codes"("campaignId");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_voucher_codes_blast_key" ON "shop_voucher_codes"("campaignId", "email") WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "shop_voucher_codes_email_idx" ON "shop_voucher_codes"("email") WHERE "email" IS NOT NULL;

-- Orders that used an admin voucher (shop_orders.voucherId stays for the automatic vouchers).
ALTER TABLE "shop_orders" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "shop_orders" ADD COLUMN "campaignCodeId" TEXT;
CREATE INDEX IF NOT EXISTS "shop_orders_campaign_idx" ON "shop_orders"("campaignId", "voucherActive");
CREATE INDEX IF NOT EXISTS "shop_orders_campaign_code_idx" ON "shop_orders"("campaignCodeId");

-- Always empty. When an order would go over a voucher limit (quota, per customer, per day, single-use code), the
-- order transaction inserts a row here, the CHECK fails and the whole order is rolled back. This makes the limits
-- race-proof (two customers taking the last use at the same moment).
CREATE TABLE IF NOT EXISTS "shop_voucher_guard" (
    "blocked" INTEGER NOT NULL CONSTRAINT "voucher_limit_reached" CHECK ("blocked" = 0)
);
