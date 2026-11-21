import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { redeemOwnerLinkToken } from '@/lib/shop/ownerOrders';
import { setOwnerCookie, shopBase } from '@/lib/shop/server';

export const dynamic = 'force-dynamic';

/**
 * The one-time link from "Buat pesanan untuk pelanggan" (admin → Website Orders): turns on admin mode in this browser
 * and continues to the checkout, so the token never stays in the address bar or reaches page scripts.
 */
export async function GET(request: NextRequest) {
  const base = await shopBase();
  const session = await redeemOwnerLinkToken(getDB(), request.nextUrl.searchParams.get('token') ?? '', Date.now());
  // A path, not a full URL: request.url can carry the internal host after the shop-host rewrite (middleware.ts).
  const response = new NextResponse(null, { status: 303, headers: { Location: session ? `${base}/checkout` : base || '/', 'Cache-Control': 'no-store' } });
  if (session) setOwnerCookie(response, request, session);
  log(session ? 'info' : 'warn', session ? 'shop_owner_link_used' : 'shop_owner_link_refused', {});
  return response;
}
