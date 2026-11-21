-- Migration 0011 (additive only): when a website order was marked delivered, so the customer's order timeline can show
-- the time it entered "Sampai di Tujuan". Shipping no longer finishes the order: Ship order -> "Dalam Perjalanan",
-- Mark delivered -> "Sampai di Tujuan".
ALTER TABLE "shop_orders" ADD COLUMN "deliveredAt" INTEGER;

-- Orders already delivered: use the shipping time (shipping finished orders until now), else the last change of the order.
UPDATE "shop_orders"
   SET "deliveredAt" = COALESCE("shippedAt", (SELECT "updatedAt" FROM "orders" WHERE "orders"."id" = "shop_orders"."orderRowId"))
 WHERE "deliveredAt" IS NULL
   AND "orderRowId" IN (SELECT "id" FROM "orders" WHERE "deliveryStatus" = 'DELIVERED');
