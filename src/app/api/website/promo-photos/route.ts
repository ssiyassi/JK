import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { addPromoPhoto } from '@/lib/shop/promo-photos';

export async function POST(request: NextRequest) {
  try {
    const photo = await addPromoPhoto(getDB(), await readJson(request), Date.now());
    log('info', 'shop_promo_photo_added', { id: photo.id, user: actor(request) });
    return NextResponse.json({ success: true, photo });
  } catch (error) {
    return errorResponse(error, 'Failed to add photo', { route: 'POST /api/website/promo-photos', user: actor(request) });
  }
}
