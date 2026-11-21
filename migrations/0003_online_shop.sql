-- Migration 0003 (additive only): the public online shop at jentiskitchen.id.
-- Website orders are still rows in "orders" (reseller = 'Website'); these tables hold what the shop adds:
-- customer accounts, vouchers, prices/discounts per order and payment proofs. Existing tables are not modified.

CREATE TABLE IF NOT EXISTS "shop_customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,                -- lower-case
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,                -- normalised, e.g. 6281234567890
    "passwordHash" TEXT NOT NULL,
    "referredById" TEXT,                  -- shop_customers.id of the referrer
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_customers_email_key" ON "shop_customers"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_customers_phone_key" ON "shop_customers"("phone");

CREATE TABLE IF NOT EXISTS "shop_sessions" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_sessions_customer_idx" ON "shop_sessions"("customerId");

CREATE TABLE IF NOT EXISTS "shop_password_resets" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "usedAt" INTEGER
);

CREATE TABLE IF NOT EXISTS "shop_login_failures" (
    "email" TEXT NOT NULL,
    "at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_login_failures_idx" ON "shop_login_failures"("email", "at");

-- kind: WELCOME (35%), MONTHLY (20%), REFERRAL (25%). Each code belongs to one customer and is used once.
CREATE TABLE IF NOT EXISTS "shop_vouchers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "capAmount" INTEGER NOT NULL,
    "period" TEXT,                        -- MONTHLY only: YYYY-MM (Jakarta)
    "sourceCustomerId" TEXT,              -- REFERRAL only: the referred customer whose delivery earned it
    "expiresAt" INTEGER,                  -- NULL = never expires
    "emailedAt" INTEGER,
    "createdAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_vouchers_code_key" ON "shop_vouchers"("code");
CREATE INDEX IF NOT EXISTS "shop_vouchers_customer_idx" ON "shop_vouchers"("customerId");
-- One welcome voucher per customer, one monthly voucher per customer per month, one referral reward per referred customer.
CREATE UNIQUE INDEX IF NOT EXISTS "shop_vouchers_welcome_key" ON "shop_vouchers"("customerId") WHERE "kind" = 'WELCOME';
CREATE UNIQUE INDEX IF NOT EXISTS "shop_vouchers_monthly_key" ON "shop_vouchers"("customerId", "period") WHERE "kind" = 'MONTHLY';
CREATE UNIQUE INDEX IF NOT EXISTS "shop_vouchers_referral_key" ON "shop_vouchers"("sourceCustomerId") WHERE "kind" = 'REFERRAL';

-- One row per website order; "orderRowId" is orders.id.
CREATE TABLE IF NOT EXISTS "shop_orders" (
    "orderRowId" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "kelurahan" TEXT NOT NULL,
    "kecamatan" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "notes" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "unitPrices" TEXT NOT NULL,           -- JSON {product: price} at the time of the order
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL,
    "deliveryFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "voucherId" TEXT,
    "voucherActive" INTEGER NOT NULL DEFAULT 0, -- 1 while the voucher is held by this order; 0 after cancel
    "proofUploadedAt" INTEGER,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_orders_customer_idx" ON "shop_orders"("customerId", "createdAt");
-- A voucher can be held by only one (non-cancelled) order: this is what makes "use once" race-proof.
CREATE UNIQUE INDEX IF NOT EXISTS "shop_orders_voucher_key" ON "shop_orders"("voucherId") WHERE "voucherActive" = 1;

CREATE TABLE IF NOT EXISTS "shop_payment_proofs" (
    "orderRowId" TEXT NOT NULL PRIMARY KEY,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,                 -- base64 (resized in the browser to stay well under D1's 2 MB row limit)
    "uploadedAt" INTEGER NOT NULL
);
