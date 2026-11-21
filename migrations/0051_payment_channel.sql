-- Migration 0051 (additive only): which e-wallet a payment link opens on (OVO | SHOPEEPAY | DANA).
-- NULL = the gateway's normal page (QRIS on DOKU; older rows). A link is only reused for the same channel.
ALTER TABLE "shop_payments" ADD COLUMN "channel" TEXT;
