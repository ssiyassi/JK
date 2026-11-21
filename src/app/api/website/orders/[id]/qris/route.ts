import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { ownerQrisLink } from '@/lib/shop/events';
import { emailLinks, paymentGateways } from '@/lib/shop/server';

/** "QRIS" in Website Orders: the QRIS payment page of an unpaid order (the open one, or a new one). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const doku = paymentGateways().find((g) => g.name === 'doku') ?? null;
    const { url, order } = await ownerQrisLink(getDB(), doku, id, emailLinks(), Date.now());
    log('info', 'shop_owner_qris', { id, orderId: order.orderId, user: actor(request) });
    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error, 'Could not get the QRIS', { route: 'POST /api/website/orders/[id]/qris', id, user: actor(request) });
  }
}
