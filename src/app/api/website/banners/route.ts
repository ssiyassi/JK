import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createBanner } from '@/lib/shop/banners';

export async function POST(request: NextRequest) {
  try {
    const banner = await createBanner(getDB(), await readJson(request), Date.now());
    log('info', 'shop_banner_created', { id: banner.id, user: actor(request) });
    return NextResponse.json({ success: true, banner });
  } catch (error) {
    return errorResponse(error, 'Failed to add banner', { route: 'POST /api/website/banners', user: actor(request) });
  }
}
