-- Migration 0049 (additive only): weekly days for a bundle (owner 16 Nov 2026: Paket Hemat only Thursday–Sunday).
-- Comma list of weekdays in Jakarta time, 0 = Sunday … 6 = Saturday (e.g. "4,5,6,0"). NULL = every day.
ALTER TABLE "shop_bundles" ADD COLUMN "weekdays" TEXT;
