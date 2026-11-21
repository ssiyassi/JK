import { NextRequest, NextResponse } from 'next/server';
import { cancelOrder } from '@/lib/core/orders';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { onOrderCancelled } from '@/lib/shop/events';
import { afterAction, emailLinks } from '@/lib/shop/server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const db = getDB();
    const { order, alreadyCancelled } = await cancelOrder(db, params.id);
    // Website orders: the voucher used becomes available again and the customer is emailed (once).
    afterAction('cancelled', () => onOrderCancelled(db, order.id, 'ADMIN', emailLinks(), Date.now()));
    log('info', alreadyCancelled ? 'order_cancel_repeated' : 'order_cancelled', { orderId: order.orderId, user: actor(request) });
    return NextResponse.json({
      success: true,
      message: alreadyCancelled ? 'Order was already cancelled' : 'Order cancelled successfully',
      order,
      alreadyCancelled,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to cancel order', { route: 'PATCH /api/orders/[id]/cancel', id: params.id, user: actor(request) });
  }
}
