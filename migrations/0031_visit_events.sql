-- Migration 0031 (additive only): website visits and shopping steps per traffic source (Meta ads, Instagram,
-- Threads, Google, direct...), sent by the browser (src/app/shop/_components/MetaPixel.tsx). No personal data: a
-- random per-tab session id, the source tags and the landing path. Rows older than 180 days are deleted.
CREATE TABLE IF NOT EXISTS "visit_events" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "at" INTEGER NOT NULL,
    "day" TEXT NOT NULL,                  -- YYYY-MM-DD (WIB)
    "sid" TEXT NOT NULL,                  -- random per browser tab session, not linked to any customer
    "event" TEXT NOT NULL,                -- visit | add_to_cart | checkout
    "source" TEXT NOT NULL,               -- utm_source, or derived from the referrer (google, instagram, threads, direct...)
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "landing" TEXT,
    "refHost" TEXT
);
CREATE INDEX IF NOT EXISTS "visit_events_day_idx" ON "visit_events"("day", "event");
-- One "visit" row per session.
CREATE UNIQUE INDEX IF NOT EXISTS "visit_events_visit_key" ON "visit_events"("sid") WHERE "event" = 'visit';
