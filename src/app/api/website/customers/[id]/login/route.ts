import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { createAdminLoginToken } from '@/lib/shop/customers';
import { emailLinks } from '@/lib/shop/server';

/** "Login as customer": returns a one-time link that opens the shop signed in as this customer. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const user = actor(request);
    const token = await createAdminLoginToken(getDB(), id, user, Date.now());
    log('info', 'shop_admin_login_created', { customer: id, user });
    return NextResponse.json({ url: `${emailLinks().shopUrl}/masuk-admin?token=${encodeURIComponent(token)}` });
  } catch (error) {
    return errorResponse(error, 'Could not open this customer', { route: 'POST /api/website/customers/[id]/login', customer: id, user: actor(request) });
  }
}
