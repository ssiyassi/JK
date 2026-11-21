import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { createOwnerLinkToken } from '@/lib/shop/ownerOrders';
import { emailLinks } from '@/lib/shop/server';

/** "Buat pesanan untuk pelanggan": returns a one-time link that opens the shop checkout in admin mode. */
export async function POST(request: NextRequest) {
  try {
    const user = actor(request);
    const token = await createOwnerLinkToken(getDB(), user, Date.now());
    log('info', 'shop_owner_link_created', { user });
    return NextResponse.json({ url: `${emailLinks().shopUrl}/pesan-admin?token=${encodeURIComponent(token)}` });
  } catch (error) {
    return errorResponse(error, 'Could not open admin mode', { route: 'POST /api/website/orders/owner-link', user: actor(request) });
  }
}
