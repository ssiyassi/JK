import { NextRequest, NextResponse } from 'next/server';
import { pastCustomersList, setPastCustomerManual } from '@/lib/marketing/pastCustomers';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Ads Report → past customers list (names + phones, admin only). */
export async function GET() {
  try {
    return NextResponse.json(await pastCustomersList(getDB(), Date.now()));
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/marketing/past-customers' });
  }
}

/** Ticks a customer as won back by hand: { id, done }. */
export async function PATCH(request: NextRequest) {
  try {
    const body = await readJson(request);
    await setPastCustomerManual(getDB(), body.id, Boolean(body.done), Date.now());
    log('info', 'past_customer_ticked', { done: Boolean(body.done), user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to save', { route: 'PATCH /api/marketing/past-customers', user: actor(request) });
  }
}
