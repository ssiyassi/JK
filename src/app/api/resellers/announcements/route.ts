import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createAnnouncement, emailAnnouncement } from '@/lib/notify/reseller-announce';
import { emailLinks, ownerEmail, sendEmails } from '@/lib/shop/server';

/** My Resellers → Announcement: emails the owner one WhatsApp button per reseller with the message filled in. */
export async function POST(request: NextRequest) {
  try {
    const to = ownerEmail();
    if (!to) throw new AppError(500, 'OWNER_EMAIL is not set, so there is nowhere to send the email');
    const db = getDB();
    const body = await readJson(request);
    const a = await createAnnouncement(db, body.message, Date.now(), true);
    const result = await emailAnnouncement(db, a, to, sendEmails, emailLinks().adminUrl);
    log('info', 'reseller_announcement', { id: a.id, ...result, user: actor(request) });
    if (!result.sent) throw new AppError(502, 'The email could not be sent right now. It will be tried again within 15 minutes.');
    return NextResponse.json({ success: true, to, ...result });
  } catch (error) {
    return errorResponse(error, 'Failed to send the announcement', { route: 'POST /api/resellers/announcements', user: actor(request) });
  }
}
