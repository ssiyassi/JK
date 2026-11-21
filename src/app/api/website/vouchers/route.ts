import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createCampaign, listCampaigns } from '@/lib/shop/campaigns';
import { sendBlastEmails } from '@/lib/shop/campaign-emails';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ campaigns: await listCampaigns(getDB(), Date.now()) });
  } catch (error) {
    return errorResponse(error, 'Failed to load vouchers', { route: 'GET /api/website/vouchers' });
  }
}

/** Creates a voucher (general code, unique codes or email blast). An email blast is emailed right away. */
export async function POST(request: NextRequest) {
  try {
    const db = getDB();
    const campaign = await createCampaign(db, await readJson(request), Date.now());
    log('info', 'shop_voucher_created', { campaign: campaign.id, type: campaign.type, user: actor(request) });
    const emails = campaign.type === 'BLAST' ? await sendBlastEmails(db, campaign) : null;
    return NextResponse.json({ success: true, campaign, emails });
  } catch (error) {
    return errorResponse(error, 'Failed to create voucher', { route: 'POST /api/website/vouchers', user: actor(request) });
  }
}
