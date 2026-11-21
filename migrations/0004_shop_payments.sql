-- Migration 0004 (additive only): DOKU Checkout payment attempts for website orders.
-- One row per payment page created; an order can have several (e.g. the first link expired).

CREATE TABLE IF NOT EXISTS "shop_payments" (
    "invoiceNumber" TEXT NOT NULL PRIMARY KEY, -- sent to DOKU as order.invoice_number
    "orderRowId" TEXT NOT NULL,                -- orders.id
    "amount" INTEGER NOT NULL,                 -- IDR, must equal what DOKU reports as paid
    "paymentUrl" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | SUCCESS
    "paidAt" INTEGER,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "shop_payments_order_idx" ON "shop_payments"("orderRowId", "createdAt");
