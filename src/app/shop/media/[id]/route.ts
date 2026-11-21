import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB } from '@/lib/server';
import { getMedia } from '@/lib/shop/media';

// Public: banner and product images uploaded in the admin. A new upload always gets a new id, so the
// browser and Cloudflare may cache each image for a year.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });
    const media = await getMedia(getDB(), id);
    if (!media) return new NextResponse('Not found', { status: 404 });
    return new NextResponse(media.bytes as unknown as BodyInit, {
      headers: {
        'content-type': media.mimeType,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error, 'Failed to load image', { route: 'GET shop/media/[id]', id });
  }
}
