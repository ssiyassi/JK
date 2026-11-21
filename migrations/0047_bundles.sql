-- Migration 0047 (additive only): bundle packages ("Paket Hemat", admin Promotions → Bundles).
-- A bundle is a set of picks (slots): for each pick the owner ticks which products the customer may choose. The customer
-- pays one final price for the whole bundle. Orders keep every picked pack as its own line (lineItems JSON with a
-- "bundle" tag), so stock, labels, reports and box counts work as before.
CREATE TABLE IF NOT EXISTS "shop_bundles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,                  -- jentiskitchen.id/paket/<slug>
    "name" TEXT NOT NULL,                  -- e.g. "Paket Hemat 3 Box"
    "tagline" TEXT NOT NULL,               -- short line under the name, e.g. "Pilih 3 pack bebas, gratis ongkir"
    "imageMediaId" TEXT,                   -- optional photo (shop_media); NULL = photos of the products
    "slots" TEXT NOT NULL,                 -- JSON array of arrays of product ids, one inner array per pick
    "price" INTEGER NOT NULL,              -- what the customer pays for the whole bundle (Rupiah)
    "freeDelivery" INTEGER NOT NULL DEFAULT 1,   -- 1 = an order with this bundle pays no delivery fee
    "voucherAllowed" INTEGER NOT NULL DEFAULT 0, -- 0 = no voucher discount on the bundle
    "active" INTEGER NOT NULL DEFAULT 0,   -- 1 = shown in the shop
    "startsAt" INTEGER,                    -- optional window (ms); NULL = no limit
    "endsAt" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_bundles_slug_key" ON "shop_bundles"("slug");
