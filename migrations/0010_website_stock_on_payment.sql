-- Migration 0010: website orders take stock (and appear in the admin order list) only once they are paid,
-- and "Ship order" finishes the order (delivery = DELIVERED).
ALTER TABLE "shop_orders" ADD COLUMN "stockTakenAt" INTEGER;    -- when the order's stock was deducted; NULL = not yet

-- Every website order placed before this migration already took its stock when it was placed.
UPDATE "shop_orders" SET "stockTakenAt" = "createdAt" WHERE "stockTakenAt" IS NULL;

-- Orders that were already shipped are finished under the new rule.
UPDATE "orders" SET "deliveryStatus" = 'DELIVERED'
 WHERE "deliveryStatus" = 'PENDING' AND "id" IN (SELECT "orderRowId" FROM "shop_orders" WHERE "shippedAt" IS NOT NULL);
