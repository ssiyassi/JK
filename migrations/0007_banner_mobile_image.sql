-- Migration 0007 (additive only): a separate mobile image per homepage banner.
-- The existing image columns hold the desktop image (4.6:1); the new ones hold the mobile image (39:25).
ALTER TABLE "shop_banners" ADD COLUMN "mobileImageMediaId" TEXT;
ALTER TABLE "shop_banners" ADD COLUMN "mobileImagePath" TEXT;

-- Existing banners use their current image for both until a mobile image is uploaded.
UPDATE "shop_banners" SET "mobileImageMediaId" = "imageMediaId", "mobileImagePath" = "imagePath";
