-- Migration 0033 (additive only): how the customer chose to pay a website order.
-- QRIS (online payment page) | TRANSFER (manual bank transfer + uploaded proof). NULL = orders from before this choice.
ALTER TABLE "shop_orders" ADD COLUMN "paymentMethod" TEXT;
