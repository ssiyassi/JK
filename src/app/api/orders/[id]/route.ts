import { NextRequest, NextResponse } from 'next/server';
import { editOrder } from '@/lib/core/orders';
import { actor, errorResponse, getDB, idempotencyKey, log, readJson } from '@/lib/server';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  try {
    const body = await readJson(request);
    // Note: originalBabiManis etc. sent by older forms are ignored; the stored order is the source of truth.
    const { order, inventoryChanges, replayed } = await editOrder(getDB(), params.id, body, idempotencyKey(request));
    log('info', replayed ? 'order_edit_replayed' : 'order_edited', { orderId: order.orderId, inventoryChanges, user: actor(request) });
    return NextResponse.json({
      success: true,
      message: inventoryChanges
        ? 'Order updated successfully and inventory adjusted'
        : 'Order updated successfully (no inventory changes)',
      order,
      inventoryChanges,
    });
  } catch (error) {
    return errorResponse(error, 'Failed to update order', { route: 'PATCH /api/orders/[id]', id: params.id, user: actor(request) });
  }
}
