-- Migration 0026 (additive only): where a website order came from (utm tags, Meta click/browser IDs, see
-- src/lib/shop/attribution.ts). JSON, NULL for older orders or when nothing was known.
ALTER TABLE "shop_orders" ADD COLUMN "attribution" TEXT;
