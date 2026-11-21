import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { deleteBundle, parseBundleInput, setBundleActive, updateBundle } from '@/lib/shop/bundles';
import { loadCatalog } from '@/lib/shop/products';

export const dynamic = 'force-dynamic';

/** Save the whole form, or { active: true | false } from the switch on the list. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const db = getDB();
    const body = await readJson(request);
    const now = Date.now();
    if (Object.keys(body).length === 1 && typeof body.active === 'boolean') {
      await setBundleActive(db, id, body.active, now);
      log('info', body.active ? 'shop_bundle_on' : 'shop_bundle_off', { bundle: id, user: actor(request) });
      return NextResponse.json({ success: true });
    }
    const bundle = await updateBundle(db, id, parseBundleInput(body, await loadCatalog(db)), now);
    log('info', 'shop_bundle_updated', { bundle: id, price: bundle.price, active: bundle.active, user: actor(request) });
    return NextResponse.json({ success: true, bundle });
  } catch (error) {
    return errorResponse(error, 'Failed to save bundle', { route: 'PATCH /api/website/bundles/[id]', bundle: id, user: actor(request) });
  }
}

/** Delete a bundle that was never ordered. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await deleteBundle(getDB(), id);
    log('info', 'shop_bundle_deleted', { bundle: id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete bundle', { route: 'DELETE /api/website/bundles/[id]', bundle: id, user: actor(request) });
  }
}
