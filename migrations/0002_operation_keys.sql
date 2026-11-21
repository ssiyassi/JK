-- Migration 0002 (additive only): records each write operation once, so retried or
-- double-submitted requests cannot create duplicate orders or change stock twice.
-- Existing tables are not modified.
CREATE TABLE IF NOT EXISTS "operation_keys" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" INTEGER NOT NULL
);

-- Read-performance indexes (no behaviour change).
CREATE INDEX IF NOT EXISTS "orders_date_idx" ON "orders"("date");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders"("orderStatus");
CREATE INDEX IF NOT EXISTS "stock_movement_history_date_idx" ON "stock_movement_history"("date");
