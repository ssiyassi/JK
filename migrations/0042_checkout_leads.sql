-- Unfinished checkouts (owner's request, 2026-11-05): a guest typed their phone number at checkout, the form says we may
-- help by WhatsApp. Removed when they order or after 14 days (pruned with the visit data). id = random per checkout visit.
CREATE TABLE IF NOT EXISTS "checkout_leads" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "phone" TEXT NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "items" TEXT NOT NULL DEFAULT '',
  "subtotal" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT '',
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "alertedAt" INTEGER,
  "contactedAt" INTEGER
);
CREATE INDEX IF NOT EXISTS "checkout_leads_phone_idx" ON "checkout_leads"("phone");
CREATE INDEX IF NOT EXISTS "checkout_leads_updated_idx" ON "checkout_leads"("updatedAt");
