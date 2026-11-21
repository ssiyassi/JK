import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { shipOrder } from '@/lib/shop/events';
import { emailLinks, sendEmailsInBackground } from '@/lib/shop/server';

/** "Ship order": { courier, trackingUrl or trackingNumber (TIKI, JNE), courierFee }. Emails the customer the first time; later calls only update the link. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const { emails, firstTime } = await shipOrder(getDB(), id, body.trackingUrl, emailLinks(), Date.now(), body.courierFee, body.courier, body.trackingNumber);
    log('info', firstTime ? 'shop_order_shipped' : 'shop_tracking_updated', { id, user: actor(request) });
    sendEmailsInBackground(emails);
    return NextResponse.json({ success: true, firstTime });
  } catch (error) {
    return errorResponse(error, 'Failed to ship order', { route: 'POST /api/website/orders/[id]/ship', id, user: actor(request) });
  }
}
