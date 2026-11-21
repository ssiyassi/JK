-- Scheduled Instagram posts (owner, 2026-11-11): the 15-minute cron publishes each one at its time through the
-- Instagram Graph API (src/lib/marketing/instagram.ts). Pictures are JPEGs in shop_media, served at /media/<id>.
CREATE TABLE IF NOT EXISTS "instagram_posts" (
  "id" TEXT NOT NULL PRIMARY KEY,           -- e.g. w46-1
  "scheduledAt" INTEGER NOT NULL,           -- ms; posted on the first 15-minute run at or after it
  "caption" TEXT NOT NULL,
  "mediaIds" TEXT NOT NULL,                 -- JSON array of shop_media ids, 1 = single picture, 2-10 = carousel
  "status" TEXT NOT NULL DEFAULT 'QUEUED',  -- QUEUED | POSTED | FAILED | CANCELLED
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "containerId" TEXT,                       -- Instagram container being published (so a retry never posts twice)
  "igMediaId" TEXT,
  "permalink" TEXT,
  "error" TEXT,
  "postedAt" INTEGER,
  "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "instagram_posts_due" ON "instagram_posts"("status", "scheduledAt");
