import { NextRequest, NextResponse } from 'next/server';
import { createReseller, deleteReseller, searchResellers, updateResellerLabelName, updateResellerPhone } from '@/lib/core/resellers';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const search = new URL(request.url).searchParams.get('search');
    return NextResponse.json(await searchResellers(getDB(), search));
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/resellers' });
  }
}

export async function POST(request: NextRequest) {
  try {
    const reseller = await createReseller(getDB(), await readJson(request));
    log('info', 'reseller_created', { reseller: reseller.reseller, parent: reseller.parentReseller, user: actor(request) });
    return NextResponse.json({ success: true, message: 'Reseller created successfully', reseller });
  } catch (error) {
    return errorResponse(error, 'Failed to create reseller', { route: 'POST /api/resellers', user: actor(request) });
  }
}

/**
 * Saves a reseller's WhatsApp number: { id, phone } (empty phone removes it),
 * or the name on the shipping label: { id, labelName } (empty goes back to the reseller name).
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await readJson(request);
    const id = typeof body.id === 'string' ? body.id : null;
    if ('labelName' in body) {
      const labelName = await updateResellerLabelName(getDB(), id, body.labelName);
      log('info', 'reseller_label_name_updated', { id, user: actor(request) });
      return NextResponse.json({ success: true, labelName });
    }
    const phone = await updateResellerPhone(getDB(), id, body.phone);
    log('info', 'reseller_phone_updated', { id, user: actor(request) });
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    return errorResponse(error, 'Failed to save', { route: 'PATCH /api/resellers', user: actor(request) });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    await deleteReseller(getDB(), id);
    log('info', 'reseller_deleted', { id, user: actor(request) });
    return NextResponse.json({ success: true, message: 'Reseller deleted successfully' });
  } catch (error) {
    return errorResponse(error, 'Failed to delete reseller', { route: 'DELETE /api/resellers', user: actor(request) });
  }
}
