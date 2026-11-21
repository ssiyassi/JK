import { NextRequest, NextResponse } from 'next/server';
import { setOwnerCookie, shopBase } from '@/lib/shop/server';

export const dynamic = 'force-dynamic';

/** "Keluar mode admin": turns admin mode off in this browser and goes back to the shop. */
export async function GET(request: NextRequest) {
  const base = await shopBase();
  const response = new NextResponse(null, { status: 303, headers: { Location: base || '/', 'Cache-Control': 'no-store' } });
  setOwnerCookie(response, request, null);
  return response;
}
