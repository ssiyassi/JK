import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { hideApplication } from '@/lib/shop/collabs';

/** Hides an influencer sign-up from the list (not interested). */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await hideApplication(getDB(), id, Date.now());
    log('info', 'shop_collab_application_hidden', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to hide the sign-up', { route: 'DELETE /api/website/collabs/applications/[id]', id, user: actor(request) });
  }
}
