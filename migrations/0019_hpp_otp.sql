-- Migration 0019: email code (OTP) lock for the HPP & Profit pages.
--   hpp_otp_codes: codes emailed to the owner (only a hash is stored); 10 minutes, 5 tries each
--   hpp_unlocks:   unlocked browsers (cookie token, only its hash is stored)

CREATE TABLE IF NOT EXISTS "hpp_otp_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codeHash" TEXT NOT NULL,
    "expiresAt" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" INTEGER,
    "createdAt" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "hpp_otp_codes_created_idx" ON "hpp_otp_codes"("createdAt");

CREATE TABLE IF NOT EXISTS "hpp_unlocks" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" INTEGER NOT NULL,
    "createdAt" INTEGER NOT NULL
);
