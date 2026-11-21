-- Payday Promo page (jentiskitchen.id/payday-promo) and the reseller WhatsApp message, edited each month in
-- Website → Payday. One row (id = 'current'); no row = the defaults in src/lib/shop/payday.ts.
CREATE TABLE IF NOT EXISTS "shop_payday_promo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageMediaId" TEXT,                  -- uploaded poster; NULL = the built-in October 2026 poster
    "startDate" TEXT NOT NULL,            -- YYYY-MM-DD (Jakarta)
    "endDate" TEXT NOT NULL,              -- YYYY-MM-DD (Jakarta), last promo day
    "caption" TEXT NOT NULL,              -- one point per line, shown under the poster
    "whatsappTemplate" TEXT NOT NULL,     -- {{reseller name}}, {{month}}, {{link}}
    "updatedAt" INTEGER NOT NULL
);
