-- Daily Google Ads results per campaign, sent by the script in the Google Ads account (scripts/google-ads-script.js).
CREATE TABLE IF NOT EXISTS "google_ad_insights" (
    "date" TEXT NOT NULL,                 -- YYYY-MM-DD in the ad account's time zone (Asia/Jakarta)
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "spend" INTEGER NOT NULL DEFAULT 0,   -- whole Rupiah
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" REAL NOT NULL DEFAULT 0,      -- as counted by Google, not real orders
    "conversionValue" REAL NOT NULL DEFAULT 0,  -- as counted by Google, not real revenue
    "syncedAt" INTEGER NOT NULL,
    PRIMARY KEY ("date", "campaignId")
);
