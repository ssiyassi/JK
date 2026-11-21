import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { addOrderEmail } from '@/lib/shop/order-email';
import { emailLinks, sendEmailsInBackground } from '@/lib/shop/server';

/** "Add email" on a guest website order: { email, sendPaidEmail?: boolean }. See shop/order-email.ts. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const result = await addOrderEmail(getDB(), id, body, emailLinks(), Date.now());
    log('info', 'shop_order_email_added', { id, account: result.account, firstPurchase: result.firstPurchaseMarked, sent: result.emails.length, user: actor(request) });
    sendEmailsInBackground(result.emails);
    return NextResponse.json({ success: true, account: result.account, firstPurchaseMarked: result.firstPurchaseMarked, sent: result.emails.length });
  } catch (error) {
    return errorResponse(error, 'Failed to add the email', { route: 'PATCH /api/website/orders/[id]/email', id, user: actor(request) });
  }
}
