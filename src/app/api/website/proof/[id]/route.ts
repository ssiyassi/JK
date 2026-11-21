import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB } from '@/lib/server';
import { getProof } from '@/lib/shop/orders';

// Admin only (behind Cloudflare Access): the customer's transfer screenshot.
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const proof = await getProof(getDB(), id);
    if (!proof) return NextResponse.json({ error: 'No payment proof uploaded' }, { status: 404 });
    return new NextResponse(proof.bytes as unknown as BodyInit, {
      headers: { 'content-type': proof.mimeType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load payment proof', { route: 'GET /api/website/proof/[id]', id, user: actor(request) });
  }
}
