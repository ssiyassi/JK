-- "Login as customer" (Website -> Customers): the owner opens the shop signed in as a customer to help them reorder.
-- One-time links; only a hash of each token is stored, and the rows stay as a history of who opened which account.
CREATE TABLE IF NOT EXISTS "shop_admin_logins" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "createdBy" TEXT,                     -- the admin's login (Cloudflare Access email)
    "createdAt" INTEGER NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "usedAt" INTEGER
);
CREATE INDEX IF NOT EXISTS "shop_admin_logins_customer_idx" ON "shop_admin_logins"("customerId", "createdAt");
-- 1 = a session opened by the owner: short-lived, shows a notice, no Meta Pixel or visit tracking.
ALTER TABLE "shop_sessions" ADD COLUMN "byAdmin" INTEGER NOT NULL DEFAULT 0;
