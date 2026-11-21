-- New-customer discount (the 35% promised in the ads), 2026-10-22: guests get it at checkout without an account.
-- newCustomerDiscount = 1 on every order that used it: a WELCOME voucher, or the guest discount (no voucher row).
-- While such an order is active (voucherActive = 1, i.e. not cancelled), its phone numbers and emails cannot use the
-- discount again.
ALTER TABLE "shop_orders" ADD COLUMN "newCustomerDiscount" INTEGER NOT NULL DEFAULT 0;
UPDATE "shop_orders" SET "newCustomerDiscount" = 1
 WHERE "voucherId" IN (SELECT "id" FROM "shop_vouchers" WHERE "kind" = 'WELCOME');
CREATE INDEX IF NOT EXISTS "shop_orders_new_customer_idx" ON "shop_orders"("newCustomerDiscount", "voucherActive");
CREATE INDEX IF NOT EXISTS "shop_orders_contact_email_idx" ON "shop_orders"("contactEmail");
