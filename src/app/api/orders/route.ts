import { NextRequest, NextResponse } from 'next/server';
import { createOrder, listOrders } from '@/lib/core/orders';
import { actor, errorResponse, getDB, idempotencyKey, log, readJson } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listOrders(getDB()));
  } catch (error) {
    return errorResponse(error, 'Failed to fetch orders', { route: 'GET /api/orders' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const { order, replayed } = await createOrder(getDB(), body, idempotencyKey(request));
    log('info', replayed ? 'order_create_replayed' : 'order_created', { orderId: order.orderId, user: actor(request) });
    return NextResponse.json({
      success: true,
      message: 'Order created successfully',
      orderId: order.orderId,
      order,
      replayed,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to create order', { route: 'POST /api/orders', user: actor(request) });
  }
}
