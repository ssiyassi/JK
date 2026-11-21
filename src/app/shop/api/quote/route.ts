import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { quote } from '@/lib/shop/orders';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import type { Buyer } from '@/lib/shop/customers';
import { assertSameOrigin, clientIp, currentCustomer } from '@/lib/shop/server';
import { normalizePhone } from '@/lib/shop/util';

/**
 * Checks a voucher code against the cart and returns the prices. Saves nothing. Guests send the delivery phone typed
 * so far (guestPhone), so per-customer voucher limits can be checked early; the order checks them again.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const customer = await currentCustomer();
    const db = getDB();
    const now = Date.now();
    const body = await readJson(request);
    if (body.voucherCode) await hitRateLimits(db, [customer ? LIMITS.voucherTry(customer.id) : LIMITS.guestVoucherTry(clientIp(request))], now);
    const buyer: Buyer = customer ?? { guest: true, email: null, phone: guestPhone(body.guestPhone) };
    const { price, voucher } = await quote(db, buyer, body, now);
    return NextResponse.json({
      price,
      voucher: voucher
        ? { code: voucher.code, percent: voucher.percent, fixedAmount: voucher.fixedAmount ?? null, capAmount: voucher.capAmount, minOrder: voucher.minOrder ?? 0 }
        : null,
    });
  } catch (error) {
    return errorResponse(error, 'Gagal menghitung harga', { route: 'POST shop/api/quote' });
  }
}

function guestPhone(value: unknown): string | null {
  try {
    return typeof value === 'string' && value.trim() ? normalizePhone(value) : null;
  } catch {
    return null; // not a full number yet
  }
}
