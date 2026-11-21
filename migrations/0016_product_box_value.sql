-- Migration 0016 (additive only): how many boxes one pack of a product counts as in an order's box counter
-- (reseller sales, parent fees, Payday Promo). Can be a decimal, e.g. 0.5 or 1.5. Existing products count 1 box each.
ALTER TABLE "shop_products" ADD COLUMN "boxValue" REAL NOT NULL DEFAULT 1;
