-- Migration 0015 (additive only): every product created in the admin is now a stock product. Creating one adds its
-- quantity columns to current_inventory, orders and stock_movement_history at that moment (see src/lib/core/products.ts);
-- shop_products (rows with a stockColumn) is the list of stock products, in display order.

-- Short name used on the admin pages and in Telegram (e.g. "Babi Manis"); NULL = use the product name.
ALTER TABLE "shop_products" ADD COLUMN "shortName" TEXT;
UPDATE "shop_products" SET "shortName" = 'Babi Manis' WHERE "product" = 'babiManis';
UPDATE "shop_products" SET "shortName" = 'Babi Asin' WHERE "product" = 'babiAsin';
UPDATE "shop_products" SET "shortName" = 'Sapi Manis' WHERE "product" = 'sapiManis';
UPDATE "shop_products" SET "shortName" = 'Sapi Asin' WHERE "product" = 'sapiAsin';
