import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { hitRateLimits } from '@/lib/shop/ratelimit';
import { clientIp } from '@/lib/shop/server';
import { parseVisit, recordVisit } from '@/lib/shop/visits';

// Visit / shopping-step beacon from the shop pages (traffic by source, see src/lib/shop/visits.ts). Always answers 204
// so tracking never shows an error to a shopper.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const ownHost = (request.headers.get('host') ?? '').replace(/:\d+$/, '').toLowerCase();
    const visit = parseVisit(body, ownHost);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [{ key: `track:ip:${clientIp(request)}`, max: 400, windowMs: 3600 * 1000 }], now);
    await recordVisit(db, visit, now);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 400 && status !== 429) log('warn', 'visit_track_failed', { message: error instanceof Error ? error.message : String(error) });
  }
  return new NextResponse(null, { status: 204 });
}
