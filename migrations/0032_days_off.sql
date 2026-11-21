-- Migration 0032 (additive only): the owner's days off (Website → Days Off). No website delivery on these days: the
-- checkout calendar shows them as "Penuh" and the earliest delivery day becomes the day after the day off ends.
-- The shop stays open for orders. The note is for the admin only, customers never see it.
CREATE TABLE IF NOT EXISTS "shop_days_off" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" TEXT NOT NULL,            -- YYYY-MM-DD (WIB), first day off
    "endDate" TEXT NOT NULL,              -- YYYY-MM-DD (WIB), last day off (same as startDate for a single day)
    "note" TEXT,
    "createdAt" INTEGER NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_days_off_end_idx" ON "shop_days_off"("endDate");
