import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { logPaydayPoster } from '@/lib/shop/paydayPosters';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp } from '@/lib/shop/server';

/** "Buat Postermu di Sini" (jentiskitchen.id/payday-promo): saves who made a poster, for the list in Website → Payday. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.paydayPoster(clientIp(request))], now);
    await logPaydayPoster(db, await readJson(request), now);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, 'Gagal menyimpan.', { route: 'POST shop/api/payday-poster' });
  }
}
