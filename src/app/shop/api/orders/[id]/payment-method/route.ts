import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { isWalletMethod, parsePaymentMethod, setPaymentMethod, WALLET_LABEL } from '@/lib/shop/orders';
import { assertSameOrigin, gatewayForMethod, orderViewer } from '@/lib/shop/server';

/** The customer switches an unpaid order between QRIS, OVO, ShopeePay and manual bank transfer (order page). */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    const { customer, customerId, guestKey } = await orderViewer(id);
    const method = parsePaymentMethod((await readJson(request)).paymentMethod);
    if (isWalletMethod(method) && !gatewayForMethod(method, customer?.email)) {
      throw new AppError(400, `Pembayaran ${WALLET_LABEL[method]} belum tersedia. Silakan pilih cara lain.`);
    }
    const order = await setPaymentMethod(getDB(), { customerId, guestKey }, id, method);
    log('info', 'shop_payment_method_changed', { orderId: order.orderId, method });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Cara pembayaran gagal diganti. Silakan coba lagi.', { route: 'POST shop/api/orders/[id]/payment-method', id });
  }
}
