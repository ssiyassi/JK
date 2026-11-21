import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { setAffiliateDisabled } from '@/lib/shop/affiliates';

/** { disabled: true | false }: switches the affiliate off / on. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const db = getDB();
    const now = Date.now();
    await setAffiliateDisabled(db, id, body.disabled === true, now);
    log('info', 'shop_affiliate_changed', { id, disabled: body.disabled, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to change the affiliate', { route: 'PATCH /api/website/affiliates/[id]', id, user: actor(request) });
  }
}
