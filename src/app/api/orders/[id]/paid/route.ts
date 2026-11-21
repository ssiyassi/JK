import { NextRequest, NextResponse } from 'next/server';
import { setPaymentPaid } from '@/lib/core/orders';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { onOrderPaid } from '@/lib/shop/events';
import { emailLinks, ownerEmail, afterAction, metaPurchase, telegram } from '@/lib/shop/server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const db = getDB();
    const order = await setPaymentPaid(db, params.id);
    log('info', 'order_paid', { orderId: order.orderId, user: actor(request) });
    // Website orders: email the customer and the owner (once). No effect on other orders.
    afterAction('paid', () => onOrderPaid(db, order.id, ownerEmail(), emailLinks(), Date.now(), telegram(), metaPurchase()));
    return NextResponse.json({ success: true, message: 'Order marked as paid successfully', order });
  } catch (error) {
    return errorResponse(error, 'Failed to mark order as paid', { route: 'PATCH /api/orders/[id]/paid', id: params.id, user: actor(request) });
  }
}
