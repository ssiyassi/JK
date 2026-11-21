-- Migration 0048 (additive only): Instagram stories in the same queue (owner, 2026-11-14: "make the schedule like the
-- post ... routinely"). kind = 'FEED' (single picture / carousel, as before) or 'STORY' (one 1080×1920 picture, no caption;
-- the Graph API cannot add a link sticker).
ALTER TABLE "instagram_posts" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'FEED';
