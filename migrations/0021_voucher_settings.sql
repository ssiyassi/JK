-- Editable terms of the automatic vouchers (Website → Vouchers → Automatic vouchers): WELCOME, REFERRAL, MONTHLY.
-- No row = the default from VOUCHER_RULES in src/lib/shop/catalog.ts. Changes apply to vouchers issued afterwards;
-- vouchers already issued keep the percent and cap stored on them (shop_vouchers).
CREATE TABLE IF NOT EXISTS "shop_voucher_settings" (
    "kind" TEXT NOT NULL PRIMARY KEY,     -- WELCOME | REFERRAL | MONTHLY
    "percent" INTEGER NOT NULL,
    "capAmount" INTEGER NOT NULL,         -- max discount in Rupiah
    "updatedAt" INTEGER NOT NULL
);
