import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { deleteBanner, moveBanner, updateBanner } from '@/lib/shop/banners';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  try {
    const banner = await updateBanner(getDB(), id, await readJson(request), Date.now());
    log('info', 'shop_banner_updated', { id, user: actor(request) });
    return NextResponse.json({ success: true, banner });
  } catch (error) {
    return errorResponse(error, 'Failed to save banner', { route: 'PATCH /api/website/banners/[id]', id, user: actor(request) });
  }
}

/** Move a banner: { direction: 'up' | 'down' }. */
export async function POST(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const banners = await moveBanner(getDB(), id, body.direction === 'up' ? 'up' : 'down', Date.now());
    return NextResponse.json({ success: true, banners });
  } catch (error) {
    return errorResponse(error, 'Failed to move banner', { route: 'POST /api/website/banners/[id]', id, user: actor(request) });
  }
}

export async function DELETE(request: NextRequest, context: Ctx) {
  const { id } = await context.params;
  try {
    await deleteBanner(getDB(), id);
    log('info', 'shop_banner_deleted', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete banner', { route: 'DELETE /api/website/banners/[id]', id, user: actor(request) });
  }
}
