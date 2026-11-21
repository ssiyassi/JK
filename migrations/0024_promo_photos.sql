-- Photos on the reseller page jentiskitchen.id/hadiah-reseller/foto, added and removed in Website → Promo Photos.
-- Starts with the built-in product photos and the reward poster (files under /public), which can be removed too.
-- The current Payday poster is always shown first and is not stored here (it comes from shop_payday_promo).
CREATE TABLE IF NOT EXISTS "shop_promo_photos" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageMediaId" TEXT,                  -- uploaded full image, or
    "thumbMediaId" TEXT,                  -- uploaded thumbnail (square)
    "imagePath" TEXT,                     -- built-in full image under /public
    "thumbPath" TEXT,                     -- built-in thumbnail under /public
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL
);
INSERT OR IGNORE INTO "shop_promo_photos" (id, imageMediaId, thumbMediaId, imagePath, thumbPath, label, sortOrder, createdAt) VALUES
  ('builtin-foto-01', NULL, NULL, '/shop/reseller/foto/foto-01.jpg', '/shop/reseller/foto/foto-01-thumb.jpg', 'Foto produk 1', 1, 0),
  ('builtin-foto-02', NULL, NULL, '/shop/reseller/foto/foto-02.jpg', '/shop/reseller/foto/foto-02-thumb.jpg', 'Foto produk 2', 2, 0),
  ('builtin-foto-03', NULL, NULL, '/shop/reseller/foto/foto-03.jpg', '/shop/reseller/foto/foto-03-thumb.jpg', 'Foto produk 3', 3, 0),
  ('builtin-foto-04', NULL, NULL, '/shop/reseller/foto/foto-04.jpg', '/shop/reseller/foto/foto-04-thumb.jpg', 'Foto produk 4', 4, 0),
  ('builtin-foto-05', NULL, NULL, '/shop/reseller/foto/foto-05.jpg', '/shop/reseller/foto/foto-05-thumb.jpg', 'Foto produk 5', 5, 0),
  ('builtin-foto-06', NULL, NULL, '/shop/reseller/foto/foto-06.jpg', '/shop/reseller/foto/foto-06-thumb.jpg', 'Foto produk 6', 6, 0),
  ('builtin-foto-07', NULL, NULL, '/shop/reseller/foto/foto-07.jpg', '/shop/reseller/foto/foto-07-thumb.jpg', 'Foto produk 7', 7, 0),
  ('builtin-foto-08', NULL, NULL, '/shop/reseller/foto/foto-08.jpg', '/shop/reseller/foto/foto-08-thumb.jpg', 'Foto produk 8', 8, 0),
  ('builtin-foto-09', NULL, NULL, '/shop/reseller/foto/foto-09.jpg', '/shop/reseller/foto/foto-09-thumb.jpg', 'Foto produk 9', 9, 0),
  ('builtin-foto-10', NULL, NULL, '/shop/reseller/foto/foto-10.jpg', '/shop/reseller/foto/foto-10-thumb.jpg', 'Foto produk 10', 10, 0),
  ('builtin-hadiah-poster', NULL, NULL, '/shop/reseller/hadiah-nov-des-2026-status.jpg', '/shop/reseller/hadiah-nov-des-2026.jpg', 'Poster hadiah reseller', 11, 0);
