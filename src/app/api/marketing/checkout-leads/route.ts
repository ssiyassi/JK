import { NextRequest, NextResponse } from 'next/server';
import { listCheckoutLeads, setCheckoutLeadContacted } from '@/lib/shop/checkoutLeads';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Ads Report → unfinished checkouts (names + phones, admin only). */
export async function GET() {
  try {
    return NextResponse.json(await listCheckoutLeads(getDB(), Date.now()));
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/marketing/checkout-leads' });
  }
}

/** Marks a customer as messaged: { phone, contacted }. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await readJson(request);
    await setCheckoutLeadContacted(getDB(), body.phone, Boolean(body.contacted), Date.now());
    log('info', 'checkout_lead_contacted', { contacted: Boolean(body.contacted), user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to save', { route: 'PATCH /api/marketing/checkout-leads', user: actor(request) });
  }
}
