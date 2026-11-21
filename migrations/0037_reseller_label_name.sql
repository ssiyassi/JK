-- Name printed as "DARI" on the reseller shipping label (My Resellers → Label Name). Starts as the reseller name.
ALTER TABLE "resellers" ADD COLUMN "labelName" TEXT;
UPDATE "resellers" SET "labelName" = "reseller" WHERE "labelName" IS NULL;
