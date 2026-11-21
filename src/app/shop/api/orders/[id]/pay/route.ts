import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, log } from '@/lib/server';
import { isWalletMethod } from '@/lib/shop/orders';
import { paymentLinkFor } from '@/lib/shop/payments';
import { assertSameOrigin, gatewayForMethod, emailLinks, viewableOrder } from '@/lib/shop/server';

/** Returns the payment page for an unpaid order the visitor may open (existing link or a new one). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    const found = await viewableOrder(id);
    if (!found) throw new AppError(404, 'Pesanan tidak ditemukan');
    const { order, customer } = found;
    const gateway = gatewayForMethod(isWalletMethod(order.paymentMethod) ? order.paymentMethod : 'QRIS', customer?.email ?? order.contactEmail);
    if (!gateway) throw new AppError(503, 'Pembayaran online belum tersedia');
    const url = await paymentLinkFor(getDB(), gateway, order, customer, emailLinks(), Date.now());
    log('info', 'payment_link', { gateway: gateway.name, orderId: order.orderId });
    return NextResponse.json({ url });
  } catch (error) {
    return errorResponse(error, 'Halaman pembayaran tidak bisa dibuka. Silakan coba lagi sebentar lagi.', { route: 'POST shop/api/orders/[id]/pay', id });
  }
}
