-- Migration 0046 (additive only): public affiliate programme (Website → Affiliates, jentiskitchen.id/affiliate).
-- Anyone can sign up and gets their own link straight away (jentiskitchen.id/r/<code>). A customer whose FIRST paid
-- order came through that link belongs to the affiliate for good: every later paid order of that customer (same
-- account, phone or email) earns the affiliate commissionPerBox per box, paid every Sunday.
CREATE TABLE IF NOT EXISTS "shop_affiliates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,                 -- private page jentiskitchen.id/affiliate/<slug> (random ending, not in Google)
    "code" TEXT NOT NULL,                 -- link code jentiskitchen.id/r/<code> = utm_campaign, e.g. "sari7k2p"
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,             -- normalised 628...
    "email" TEXT NOT NULL,                -- lower case; their links are emailed here (sign-up and "lupa link")
    "channels" TEXT NOT NULL,             -- JSON array: instagram | tiktok | whatsapp | word_of_mouth
    "bank" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "commissionPerBox" INTEGER NOT NULL,  -- Rupiah per box, e.g. 10000
    "note" TEXT,                          -- only the owner sees it
    "disabledAt" INTEGER,                 -- NULL = active; switched off = link and commission stop
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_affiliates_slug_key" ON "shop_affiliates"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_affiliates_code_key" ON "shop_affiliates"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_affiliates_whatsapp_key" ON "shop_affiliates"("whatsapp");
CREATE UNIQUE INDEX IF NOT EXISTS "shop_affiliates_email_key" ON "shop_affiliates"("email");
