import { NextRequest, NextResponse } from 'next/server';
import { setCourierFee } from '@/lib/core/orders';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

/** Saves or corrects the delivery fee the owner paid for an order: { courierFee }. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const body = await readJson(request);
    const order = await setCourierFee(getDB(), params.id, body.courierFee);
    log('info', 'order_courier_fee', { orderId: order.orderId, courierFee: order.courierFee, user: actor(request) });
    return NextResponse.json({ success: true, order });
  } catch (error) {
    return errorResponse(error, 'Failed to save the delivery fee', { route: 'PATCH /api/orders/[id]/courier-fee', id: params.id, user: actor(request) });
  }
}
