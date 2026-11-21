-- Announcements to all resellers (My Resellers → "Announcement"). The owner gets them by email as one WhatsApp
-- button per reseller with the message filled in. A row with emailedAt NULL is emailed by the 15-minute job.
CREATE TABLE IF NOT EXISTS "reseller_announcements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,              -- {{reseller name}} is replaced per reseller
    "createdAt" INTEGER NOT NULL,
    "emailedAt" INTEGER                   -- NULL = still to email
);
