-- Migration 0005 (additive only): website content managed from the admin — products shown in the shop,
-- homepage banners, and the images they use. Existing tables are not modified except one new nullable column.

-- Uploaded images (resized in the browser before upload, so each stays well under D1's 2 MB row limit).
CREATE TABLE IF NOT EXISTS "shop_media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mimeType" TEXT NOT NULL,
    "data" TEXT NOT NULL,                  -- base64
    "createdAt" INTEGER NOT NULL
);

-- One row per inventory product column (babiManis, babiAsin, sapiManis, sapiAsin).
CREATE TABLE IF NOT EXISTS "shop_products" (
    "product" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "compareAtPrice" INTEGER,              -- optional "harga coret" (original price), shown struck through
    "visible" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "imageMediaId" TEXT,                   -- NULL = the built-in photo
    "updatedAt" INTEGER NOT NULL
);
INSERT OR IGNORE INTO "shop_products" (product, name, size, description, price, compareAtPrice, visible, sortOrder, imageMediaId, updatedAt) VALUES
  ('babiManis', 'Babi Marinade Manis', '500 gram', 'Daging babi dengan bumbu marinade manis.', 160000, NULL, 1, 1, NULL, 0),
  ('babiAsin',  'Babi Marinade Asin Gurih', '500 gram', 'Daging babi dengan bumbu marinade asin gurih.', 160000, NULL, 1, 2, NULL, 0),
  ('sapiManis', 'Sapi Marinade Manis', '500 gram', 'Daging sapi dengan bumbu marinade manis.', 160000, NULL, 1, 3, NULL, 0),
  ('sapiAsin',  'Sapi Marinade Asin Gurih', '500 gram', 'Daging sapi dengan bumbu marinade asin gurih.', 160000, NULL, 1, 4, NULL, 0);

CREATE TABLE IF NOT EXISTS "shop_banners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "badge" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageMediaId" TEXT,                   -- uploaded image, or
    "imagePath" TEXT,                      -- a built-in image under /public
    "active" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
INSERT OR IGNORE INTO "shop_banners" (id, badge, title, subtitle, imageMediaId, imagePath, active, sortOrder, createdAt, updatedAt) VALUES
  ('default-1', 'PROMO MINGGUAN', 'Nikmati Kelezatan
Daging Pilihan', 'Kualitas terbaik langsung ke depan pintu rumah Anda.', NULL, '/shop/banners/banner-1.jpg', 1, 1, 0, 0);

-- Product names at the time of each website order (JSON {product: name}), so later renames don't change old orders.
ALTER TABLE "shop_orders" ADD COLUMN "itemNames" TEXT;
