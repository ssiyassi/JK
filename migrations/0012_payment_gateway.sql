-- Migration 0012 (additive only): which payment gateway an attempt went through. Earlier rows were all DOKU.
ALTER TABLE "shop_payments" ADD COLUMN "gateway" TEXT NOT NULL DEFAULT 'doku'; -- doku | duitku
