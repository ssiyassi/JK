-- Migration 0018: HPP (cost per pack) and monthly profit.
--   meat_purchases:       meat price typed with each production (babi / sapi); monthly average = total spent / total packs
--   ingredients:          the base ingredients, each with a fixed unit
--   ingredient_purchases: every ingredient purchase (history); the newest one is the ingredient's base price
--   product_costing:      which meat and which recipe each product uses
--   recipe_items:         amounts per kg of meat (kept only in the database, never in the code)
--   cost_settings:        packaging + courier per pack, kg meat per pack, reseller prices, payment fee

CREATE TABLE IF NOT EXISTS "meat_purchases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productionId" TEXT,                 -- stock_movement_history.id of the production it came with (NULL = added by hand)
    "purchaseDate" TEXT NOT NULL,        -- YYYY-MM-DD (Jakarta)
    "meat" TEXT NOT NULL,                -- 'babi' | 'sapi'
    "price" INTEGER NOT NULL,
    "packs" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "meat_purchases_date_idx" ON "meat_purchases"("meat", "purchaseDate");

CREATE TABLE IF NOT EXISTS "ingredients" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,                -- 'gram' | 'ml' (1 ml counts as 1 gram in recipes)
    "sortOrder" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_purchases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredient" TEXT NOT NULL,
    "shopDate" TEXT NOT NULL,            -- YYYY-MM-DD (Jakarta)
    "size" REAL NOT NULL,                -- in the ingredient's unit
    "price" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "ingredient_purchases_idx" ON "ingredient_purchases"("ingredient", "shopDate", "createdAt");

CREATE TABLE IF NOT EXISTS "product_costing" (
    "product" TEXT NOT NULL PRIMARY KEY, -- shop_products.product
    "meat" TEXT NOT NULL,
    "recipe" TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "recipe_items" (
    "recipe" TEXT NOT NULL,
    "ingredient" TEXT NOT NULL,
    "amountPerKg" REAL NOT NULL,
    PRIMARY KEY ("recipe", "ingredient")
);

CREATE TABLE IF NOT EXISTS "cost_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" REAL NOT NULL
);

INSERT OR IGNORE INTO "ingredients" ("key", "name", "unit", "sortOrder") VALUES
  ('minyak', 'Minyak', 'ml', 1),
  ('kecap', 'Kecap', 'gram', 2),
  ('hitam', 'Hitam', 'ml', 3),
  ('tepung', 'Tepung', 'gram', 4),
  ('gula', 'Gula', 'gram', 5),
  ('bumbu', 'Bumbu', 'gram', 6);

-- Starting prices given by the owner on 2026-10-17.
INSERT OR IGNORE INTO "ingredient_purchases" ("id", "ingredient", "shopDate", "size", "price", "createdAt") VALUES
  ('initial-minyak', 'minyak', '2026-10-01', 2000, 49800, 0),
  ('initial-kecap', 'kecap', '2026-10-01', 6500, 171000, 0),
  ('initial-hitam', 'hitam', '2026-10-01', 600, 25500, 0),
  ('initial-tepung', 'tepung', '2026-10-01', 1000, 30120, 0),
  ('initial-gula', 'gula', '2026-10-01', 1000, 17500, 0),
  ('initial-bumbu', 'bumbu', '2026-10-01', 460, 30000, 0);

-- October 2026 meat, matched to the productions already recorded (packs = packs produced that day for that meat).
INSERT OR IGNORE INTO "meat_purchases" ("id", "productionId", "purchaseDate", "meat", "price", "packs", "createdAt") VALUES
  ('initial-20261007-babi', NULL, '2026-10-07', 'babi', 1700000, 33, 0),
  ('initial-20261007-sapi', NULL, '2026-10-07', 'sapi', 2550000, 40, 0),
  ('initial-20261009-babi', NULL, '2026-10-09', 'babi', 1700000, 38, 0),
  ('initial-20261016-sapi', NULL, '2026-10-16', 'sapi', 2584000, 40, 0),
  ('initial-20261017-sapi', NULL, '2026-10-17', 'sapi', 2635000, 41, 0);

INSERT OR IGNORE INTO "product_costing" ("product", "meat", "recipe")
  SELECT product, CASE WHEN product LIKE 'sapi%' THEN 'sapi' ELSE 'babi' END, CASE WHEN product LIKE '%Manis' THEN 'Manis' ELSE 'Asin' END
  FROM shop_products WHERE product IN ('babiManis', 'babiAsin', 'sapiManis', 'sapiAsin');

INSERT OR IGNORE INTO "cost_settings" ("key", "value") VALUES
  ('packagingPerPack', 1150),
  ('meatKgPerPack', 0.5),
  ('resellerPrice', 140000),
  ('paydayPricePer3', 350000),
  ('paymentFeePercent', 0.7);
