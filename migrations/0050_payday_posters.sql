-- Migration 0050 (additive only): log of posters resellers make with "Buat Postermu di Sini" on jentiskitchen.id/payday-promo
-- (owner 16 Nov 2026: see who made one in Website → Payday). Name and phone exactly as typed on the poster.
CREATE TABLE IF NOT EXISTS "payday_posters" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "createdAt" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "deliveryDate" TEXT NOT NULL,
  "kind" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "payday_posters_createdAt" ON "payday_posters" ("createdAt");
