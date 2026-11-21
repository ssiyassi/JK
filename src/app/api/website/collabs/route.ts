import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createCollab } from '@/lib/shop/collabs';

/** Website → Collabs: makes an influencer's private offer page (no voucher is created). */
export async function POST(request: NextRequest) {
  try {
    const collab = await createCollab(getDB(), await readJson(request), Date.now());
    log('info', 'shop_collab_created', { id: collab.id, campaign: collab.campaign, user: actor(request) });
    return NextResponse.json({ success: true, collab });
  } catch (error) {
    return errorResponse(error, 'Failed to create the collab page', { route: 'POST /api/website/collabs', user: actor(request) });
  }
}
