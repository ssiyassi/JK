-- "Ship order": which courier took the order, and the resi (tracking number) for TIKI and JNE (src/lib/shop/couriers.ts).
-- Null on orders shipped before (they only have the tracking link).
ALTER TABLE "shop_orders" ADD COLUMN "courier" TEXT;
ALTER TABLE "shop_orders" ADD COLUMN "trackingNumber" TEXT;
