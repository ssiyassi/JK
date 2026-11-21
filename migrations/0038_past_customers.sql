-- Past-customers retargeting project (owner's customer list, 2026-10-31): only a hash of each phone number is kept,
-- so the report can recognise when someone on the list orders again. inArea = lives in the delivery area (the base
-- for the success rate). Loaded from the laptop by scripts/past-customers-load.ts.
CREATE TABLE IF NOT EXISTS "past_customers" (
  "phoneHash" TEXT NOT NULL PRIMARY KEY,
  "project" TEXT NOT NULL,
  "inArea" INTEGER NOT NULL DEFAULT 1,
  "addedAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "past_customers_project_idx" ON "past_customers"("project");
