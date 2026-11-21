import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log } from '@/lib/server';
import { cancelByCustomer } from '@/lib/shop/events';
import { assertSameOrigin, emailLinks, ownerEmail, paymentGateways, orderViewer, sendEmailsInBackground, metaPurchase, telegram } from '@/lib/shop/server';

/** The customer (or the guest, in the browser that placed it) cancels an unpaid order; its voucher is freed immediately. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    const { customerId, guestKey } = await orderViewer(id);
    const db = getDB();
    const { result, emails } = await cancelByCustomer(db, paymentGateways(), id, { customerId, guestKey }, emailLinks(), ownerEmail(), Date.now(), telegram(), metaPurchase());
    sendEmailsInBackground(emails);
    log('info', 'shop_order_cancelled_by_customer', { id, result });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return errorResponse(error, 'Pesanan gagal dibatalkan. Silakan coba lagi.', { route: 'POST shop/api/orders/[id]/cancel', id });
  }
}
