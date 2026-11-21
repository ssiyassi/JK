-- Migration 0009 (additive only): small key/value store for notifications, e.g. which negative stock levels
-- were already sent to Telegram (so the same shortage is not repeated every 15 minutes).
CREATE TABLE IF NOT EXISTS "notification_state" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" INTEGER NOT NULL
);
