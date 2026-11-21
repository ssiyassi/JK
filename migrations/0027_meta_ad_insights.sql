-- Migration 0027 (additive only): daily Meta (Facebook/Instagram) ad results, one row per ad per day, copied from the
-- Marketing API by src/lib/marketing/metaAds.ts (read-only token META_ADS_TOKEN). Numbers are what Meta reports
-- (its own attribution: 7-day click / 1-day view); real orders and profit come from the shop tables.
CREATE TABLE IF NOT EXISTS "meta_ad_insights" (
    "date" TEXT NOT NULL,                -- YYYY-MM-DD, ad account time zone (Asia/Jakarta)
    "adId" TEXT NOT NULL,
    "adName" TEXT,
    "adsetId" TEXT,
    "adsetName" TEXT,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "objective" TEXT,
    "spend" INTEGER NOT NULL DEFAULT 0,  -- IDR
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,  -- per day; do not add up across days
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "landingPageViews" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "initiateCheckout" INTEGER NOT NULL DEFAULT 0,
    "registrations" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValue" INTEGER NOT NULL DEFAULT 0, -- IDR, Meta-attributed
    "actions" TEXT,                      -- raw Meta actions JSON, for anything not in a column
    "syncedAt" INTEGER NOT NULL,
    PRIMARY KEY ("date", "adId")
);
CREATE INDEX IF NOT EXISTS "meta_ad_insights_campaign_idx" ON "meta_ad_insights"("campaignId", "date");
