import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { ADMIN_SESSION_HOURS, redeemAdminLoginToken } from '@/lib/shop/customers';
import { setSessionCookie, shopBase } from '@/lib/shop/server';

export const dynamic = 'force-dynamic';

/**
 * The one-time link from "Login as customer" (admin → Website → Customers): signs this browser in as that customer for
 * a short time and continues to the homepage, so the token never stays in the address bar or reaches page scripts.
 */
export async function GET(request: NextRequest) {
  const base = await shopBase();
  const session = await redeemAdminLoginToken(getDB(), request.nextUrl.searchParams.get('token') ?? '', Date.now());
  // A path, not a full URL: request.url can carry the internal host after the shop-host rewrite (middleware.ts).
  const response = new NextResponse(null, { status: 303, headers: { Location: session ? base || '/' : `${base}/login`, 'Cache-Control': 'no-store' } });
  if (session) setSessionCookie(response, request, session, ADMIN_SESSION_HOURS * 3600);
  log(session ? 'info' : 'warn', session ? 'shop_admin_login_used' : 'shop_admin_login_refused', {});
  return response;
}
