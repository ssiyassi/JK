-- Migration 0008 (additive only): shipping step and cancellation reason for website orders.
ALTER TABLE "shop_orders" ADD COLUMN "shippedAt" INTEGER;       -- when the owner clicked "Ship order"
ALTER TABLE "shop_orders" ADD COLUMN "trackingUrl" TEXT;        -- delivery tracking link given when shipping
ALTER TABLE "shop_orders" ADD COLUMN "cancelReason" TEXT;       -- EXPIRED (payment not completed) | ADMIN
