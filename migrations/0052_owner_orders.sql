-- Migration 0052 (additive only): orders the owner places for a customer ("Buat pesanan untuk pelanggan").
-- shop_orders.placedByOwner = the admin's login (Cloudflare Access email, or 'owner'); NULL = the customer ordered.
-- Such orders get 24 hours to pay and the customer picks the payment method from the link the owner sends.
ALTER TABLE "shop_orders" ADD COLUMN "placedByOwner" TEXT;

-- One-time links from the admin (kind LINK, 5 minutes) and the short "admin mode" they open on the shop (kind SESSION).
-- Only a hash of each token is stored.
CREATE TABLE IF NOT EXISTS "shop_owner_sessions" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,                 -- LINK | SESSION
    "createdBy" TEXT,                     -- the admin's login
    "createdAt" INTEGER NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "usedAt" INTEGER
);
