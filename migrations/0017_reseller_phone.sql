-- Migration 0017 (additive only): the reseller's WhatsApp number (628xx), for the Sunday reward recap email's
-- WhatsApp buttons. Optional; existing resellers start without one.
ALTER TABLE "resellers" ADD COLUMN "phone" TEXT;
