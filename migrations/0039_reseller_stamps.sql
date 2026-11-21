-- Reseller stamp card (owner, 2026-11-01): boxes count when an order is DELIVERED, in the reward period of the day it
-- was marked delivered, and a delivery marked after the Sunday 12:00 recap counts for the next week.
-- 1) When an admin order was marked delivered. Past delivered orders: the website order's delivered time, else the
--    order's last change (delivered orders can no longer be edited, so that is when it was marked delivered).
ALTER TABLE "orders" ADD COLUMN "deliveredAt" INTEGER;
UPDATE "orders"
   SET "deliveredAt" = COALESCE((SELECT s."deliveredAt" FROM "shop_orders" s WHERE s."orderRowId" = "orders"."id"), "updatedAt")
 WHERE "deliveryStatus" = 'DELIVERED' AND "deliveredAt" IS NULL;

-- 2) Telegram (Reporting bot) alerts already sent when a reseller filled a stamp level, so each goes out once.
--    milestone = round * 100 + level boxes (15, 25, 65, 100): after 100 the card starts again in the same period.
CREATE TABLE IF NOT EXISTS "reseller_stamp_alerts" (
    "reseller" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,          -- YYYY-MM-DD, first day of the reward period
    "milestone" INTEGER NOT NULL,
    "sentAt" INTEGER NOT NULL,
    PRIMARY KEY ("reseller", "periodStart", "milestone")
);
