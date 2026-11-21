import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { addBlastRecipients, getCampaign } from '@/lib/shop/campaigns';
import { sendBlastEmails } from '@/lib/shop/campaign-emails';
import { AppError } from '@/lib/core/d1';

/**
 * Email blast: { recipients } adds people who don't have a code yet; then every code whose email has not gone out
 * is (re)sent. Safe to click again: nobody gets a second code or a second email.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const db = getDB();
    const body = await readJson(request);
    const added = body.recipients ? await addBlastRecipients(db, id, body.recipients, Date.now()) : 0;
    const campaign = await getCampaign(db, id);
    if (!campaign || campaign.type !== 'BLAST') throw new AppError(404, 'Voucher not found');
    const emails = await sendBlastEmails(db, campaign);
    log('info', 'shop_voucher_blast', { campaign: id, added, ...emails, user: actor(request) });
    return NextResponse.json({ success: true, added, emails });
  } catch (error) {
    return errorResponse(error, 'Failed to send voucher emails', { route: 'POST /api/website/vouchers/[id]/send', campaign: id, user: actor(request) });
  }
}
