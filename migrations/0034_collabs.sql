-- Migration 0034 (additive only): influencer collaborations (Website → Collabs).
--   shop_collabs: one private offer page per influencer (jentiskitchen.id/collab/<slug>, not in Google) with their
--     tracking link (utm_campaign) and the voucher code they will get. The voucher itself is NOT created here: the owner
--     makes it in Website → Vouchers after the influencer accepts. Accepting fills the accepted* columns.
--   shop_collab_applications: sign-ups from the public page jentiskitchen.id/collab.
CREATE TABLE IF NOT EXISTS "shop_collabs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,                 -- page address, e.g. "sarah-7k2p" (random ending so pages cannot be guessed)
    "name" TEXT NOT NULL,                 -- how the page greets them, e.g. "Sarah"
    "platform" TEXT NOT NULL,             -- instagram | tiktok (utm_source of their link)
    "handle" TEXT,                        -- e.g. "sarahmasak" (without @)
    "campaign" TEXT NOT NULL,             -- utm_campaign of their link, e.g. "sarah"
    "voucherCode" TEXT NOT NULL,          -- code shown on the page, e.g. "SARAH" (owner creates the voucher later)
    "codePercent" INTEGER NOT NULL,       -- followers' discount with the code (repeat orders), e.g. 20
    "codeCap" INTEGER NOT NULL,           -- max discount with the code in Rupiah, e.g. 100000
    "commissionPerBox" INTEGER NOT NULL,  -- Rupiah per box their followers buy, e.g. 10000
    "freeProducts" TEXT NOT NULL,         -- what we send them, e.g. "1 box Babi Marinade + 1 box Sapi Marinade"
    "contentDays" INTEGER NOT NULL,       -- first content within N days after the product arrives
    "minReels" INTEGER NOT NULL,
    "minStories" INTEGER NOT NULL,
    "startDate" TEXT NOT NULL,            -- YYYY-MM-DD (WIB), contract period
    "endDate" TEXT NOT NULL,
    "note" TEXT,                          -- only the owner sees it
    "acceptedAt" INTEGER,                 -- NULL = not accepted yet
    "acceptedName" TEXT,                  -- full name, WhatsApp, shipping address and bank details given when accepting
    "acceptedWhatsapp" TEXT,
    "acceptedAddress" TEXT,
    "acceptedBank" TEXT,
    "acceptedAccountNumber" TEXT,
    "acceptedAccountName" TEXT,
    "acceptedMessage" TEXT,
    "disabledAt" INTEGER,                 -- NULL = page active
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "shop_collabs_slug_key" ON "shop_collabs"("slug");

CREATE TABLE IF NOT EXISTS "shop_collab_applications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,             -- instagram | tiktok
    "handle" TEXT NOT NULL,
    "followers" TEXT NOT NULL,            -- as typed, e.g. "12rb"
    "whatsapp" TEXT NOT NULL,
    "city" TEXT,
    "message" TEXT,
    "collabId" TEXT,                      -- set when the owner made a collab page from this sign-up
    "hiddenAt" INTEGER,                   -- owner hid it from the list (not interested)
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_collab_applications_created_idx" ON "shop_collab_applications"("createdAt");
