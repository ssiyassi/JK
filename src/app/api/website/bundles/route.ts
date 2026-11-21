import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { createBundle, parseBundleInput } from '@/lib/shop/bundles';
import { loadCatalog } from '@/lib/shop/products';

export const dynamic = 'force-dynamic';

/** New bundle (Promotions → Bundles). */
export async function POST(request: NextRequest) {
  try {
    const db = getDB();
    const input = parseBundleInput(await readJson(request), await loadCatalog(db));
    const bundle = await createBundle(db, input, Date.now());
    log('info', 'shop_bundle_created', { bundle: bundle.id, price: bundle.price, active: bundle.active, user: actor(request) });
    return NextResponse.json({ success: true, bundle });
  } catch (error) {
    return errorResponse(error, 'Failed to create bundle', { route: 'POST /api/website/bundles', user: actor(request) });
  }
}
