import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, log } from '@/lib/server';
import { ownerQrisLink } from '@/lib/shop/events';
import { assertSameOrigin, currentOwner, emailLinks, paymentGateways } from '@/lib/shop/server';

/** Admin mode, order page: the QRIS payment page of an unpaid order, to screenshot for the customer (as in Website Orders). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    const owner = await currentOwner();
    if (!owner) throw new AppError(403, 'Mode admin sudah berakhir.');
    const doku = paymentGateways().find((g) => g.name === 'doku') ?? null;
    const { url, order } = await ownerQrisLink(getDB(), doku, id, emailLinks(), Date.now());
    log('info', 'shop_owner_qris', { id, orderId: order.orderId, user: owner });
    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error, 'QRIS tidak bisa dibuka. Coba lagi.', { route: 'POST shop/api/orders/[id]/owner-qris', id });
  }
}
