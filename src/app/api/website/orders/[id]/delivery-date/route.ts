import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { changeDeliveryDate } from '@/lib/shop/events';
import { emailLinks, sendEmailsInBackground } from '@/lib/shop/server';

/** "Change delivery date": { date: 'YYYY-MM-DD' }. Emails the customer when the date really changed. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const { emails, changed, customerHasEmail } = await changeDeliveryDate(getDB(), id, body.date, emailLinks(), Date.now());
    log('info', 'shop_delivery_date_changed', { id, date: body.date, changed, user: actor(request) });
    sendEmailsInBackground(emails);
    return NextResponse.json({ success: true, changed, customerHasEmail });
  } catch (error) {
    return errorResponse(error, 'Failed to change delivery date', { route: 'PATCH /api/website/orders/[id]/delivery-date', id, user: actor(request) });
  }
}
