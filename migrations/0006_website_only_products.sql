-- Migration 0006 (additive only): products that exist only on the website (no stock tracking), and a full list of
-- items on each website order.

-- Which inventory column a product takes stock from; NULL = website-only product.
ALTER TABLE "shop_products" ADD COLUMN "stockColumn" TEXT;
UPDATE "shop_products" SET "stockColumn" = "product" WHERE "product" IN ('babiManis', 'babiAsin', 'sapiManis', 'sapiAsin');

-- Every item of a website order as bought: JSON [{product, name, price, qty, stockColumn}].
-- Older orders have only unitPrices/itemNames plus the four quantity columns of "orders".
ALTER TABLE "shop_orders" ADD COLUMN "lineItems" TEXT;
