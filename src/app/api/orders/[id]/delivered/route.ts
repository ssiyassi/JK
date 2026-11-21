import { NextRequest, NextResponse } from 'next/server';
import { setDelivered } from '@/lib/core/orders';
import { actor, errorResponse, getDB, log } from '@/lib/server';

/** Optional JSON body { courierFee }: required when the order has no delivery fee yet. */
async function courierFeeFrom(request: NextRequest): Promise<unknown> {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' ? (body as Record<string, unknown>).courierFee : undefined;
}
import { assertCanMarkDelivered, onOrderDelivered } from '@/lib/shop/events';
import { emailLinks, afterAction } from '@/lib/shop/server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const db = getDB();
    await assertCanMarkDelivered(db, params.id); // website orders must be shipped first
    const order = await setDelivered(db, params.id, await courierFeeFrom(request));
    log('info', 'order_delivered', { orderId: order.orderId, courierFee: order.courierFee, user: actor(request) });
    // Website orders: "delivered" email to the customer and, for referred customers, the referrer's reward (once).
    afterAction('delivered', () => onOrderDelivered(db, order.id, emailLinks(), Date.now()));
    return NextResponse.json({ success: true, message: 'Order marked as delivered successfully', order });
  } catch (error) {
    return errorResponse(error, 'Failed to mark order as delivered', { route: 'PATCH /api/orders/[id]/delivered', id: params.id, user: actor(request) });
  }
}
