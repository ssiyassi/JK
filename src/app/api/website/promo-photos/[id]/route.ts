import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { removePromoPhoto } from '@/lib/shop/promo-photos';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await removePromoPhoto(getDB(), id);
    log('info', 'shop_promo_photo_removed', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to remove photo', { route: 'DELETE /api/website/promo-photos/[id]', id, user: actor(request) });
  }
}
