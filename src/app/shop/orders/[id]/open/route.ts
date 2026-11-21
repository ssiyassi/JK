import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/server';
import { getShopOrder } from '@/lib/shop/orders';
import { setGuestOrderCookie, shopBase } from '@/lib/shop/server';

export const dynamic = 'force-dynamic';

/**
 * A guest order's private link (from the order emails): /orders/<id>/open?k=<key>. Saves the key in this browser and
 * continues to the order page, so the key never stays in the address bar (or reaches page scripts such as the Pixel).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const key = request.nextUrl.searchParams.get('k') ?? '';
  const order = key ? await getShopOrder(getDB(), id) : null;
  // A path, not a full URL: request.url can carry the internal host after the shop-host rewrite (middleware.ts).
  const response = new NextResponse(null, { status: 303, headers: { Location: `${await shopBase()}/orders/${encodeURIComponent(id)}` } });
  // A wrong or old key: the order page then asks to sign in, as for any order.
  if (order?.guestKey && order.guestKey === key) setGuestOrderCookie(response, request, order);
  return response;
}
