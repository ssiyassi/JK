import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { savePaydayPromo } from '@/lib/shop/payday';

export async function PUT(request: NextRequest) {
  try {
    const body = await readJson(request);
    const promo = await savePaydayPromo(getDB(), body, Date.now());
    log('info', 'shop_payday_promo_saved', { startDate: promo.startDate, endDate: promo.endDate, newImage: Boolean(body.image), user: actor(request) });
    return NextResponse.json({ success: true, promo });
  } catch (error) {
    return errorResponse(error, 'Failed to save the Payday Promo', { route: 'PUT /api/website/payday', user: actor(request) });
  }
}
