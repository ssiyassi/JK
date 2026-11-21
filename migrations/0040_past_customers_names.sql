-- Past-customers project (owner asked 2026-11-01): the list in Ads Report shows each customer's name, phone (for the
-- WhatsApp button) and city, admin only. manualAt = the owner ticked "won back" by hand (e.g. ordered by WhatsApp
-- with another number); it counts as completed on that day when no matching order is found.
ALTER TABLE "past_customers" ADD COLUMN "name" TEXT;
ALTER TABLE "past_customers" ADD COLUMN "phone" TEXT;
ALTER TABLE "past_customers" ADD COLUMN "city" TEXT;
ALTER TABLE "past_customers" ADD COLUMN "manualAt" INTEGER;
