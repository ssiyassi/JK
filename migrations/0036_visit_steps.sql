-- Migration 0036 (additive only): visitor journeys for the daily report ("where people stopped"). visit_events also
-- gets page views, scroll depth and the checkout steps (address filled, Bayar tapped, order placed, paid), each with
-- the page path. Still no personal data: only the random per-tab session id.
ALTER TABLE "visit_events" ADD COLUMN "page" TEXT;   -- path of the page the step happened on
ALTER TABLE "visit_events" ADD COLUMN "detail" TEXT; -- scroll depth (50/90) or payment method
CREATE INDEX IF NOT EXISTS "visit_events_sid_idx" ON "visit_events"("sid", "at");
