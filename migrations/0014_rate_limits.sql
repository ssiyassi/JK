-- Migration 0014 (additive only): attempt counters for the shop's public forms (login, register, forgot/reset
-- password), per visitor IP and per email. Rows older than an hour are deleted as new ones are written.
CREATE TABLE IF NOT EXISTS "shop_rate_limits" (
    "key" TEXT NOT NULL,
    "at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_rate_limits_idx" ON "shop_rate_limits"("key", "at");
