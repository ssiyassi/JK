import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { deleteCollab, setCollabDisabled, updateCollab } from '@/lib/shop/collabs';

/** Changes the terms on the page (its address stays the same). */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const collab = await updateCollab(getDB(), id, await readJson(request), Date.now());
    log('info', 'shop_collab_changed', { id, user: actor(request) });
    return NextResponse.json({ success: true, collab });
  } catch (error) {
    return errorResponse(error, 'Failed to save the collab page', { route: 'PUT /api/website/collabs/[id]', id, user: actor(request) });
  }
}

/** { disabled: true | false }: switches the page off / on. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    await setCollabDisabled(getDB(), id, body.disabled === true, Date.now());
    log('info', 'shop_collab_switched', { id, disabled: body.disabled === true, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to change the collab page', { route: 'PATCH /api/website/collabs/[id]', id, user: actor(request) });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await deleteCollab(getDB(), id);
    log('info', 'shop_collab_deleted', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to delete the collab page', { route: 'DELETE /api/website/collabs/[id]', id, user: actor(request) });
  }
}
