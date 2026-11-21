-- Guest checkout: website orders placed without signing in.
-- guestKey: secret of the guest's private order link (kept in a cookie in the guest's browser and in order emails);
--           NULL = placed by a signed-in customer.
-- contactEmail: the email the guest typed at checkout (optional); NULL = none given, or a signed-in order.
-- A guest order belongs to an account (customerId) when the email or the voucher code used belongs to one;
-- otherwise customerId is '' (no account).
ALTER TABLE "shop_orders" ADD COLUMN "guestKey" TEXT;
ALTER TABLE "shop_orders" ADD COLUMN "contactEmail" TEXT;
-- Per-customer voucher limits for guests are counted by the delivery phone number.
CREATE INDEX IF NOT EXISTS "shop_orders_phone_idx" ON "shop_orders"("recipientPhone", "campaignId");
