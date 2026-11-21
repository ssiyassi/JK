import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { autocompletePlaces } from '@/lib/shop/places';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, placesKey } from '@/lib/shop/server';

/** Address suggestions while the customer types in the pin search box (checkout). Body: { input, sessionToken }. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const key = placesKey();
    if (!key) throw new AppError(404, 'Pencarian alamat belum tersedia');
    const db = getDB();
    await hitRateLimits(db, [LIMITS.placesSearch(clientIp(request))], Date.now());
    const suggestions = await autocompletePlaces(key, await readJson(request), (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(6000) }));
    return NextResponse.json({ suggestions });
  } catch (error) {
    return errorResponse(error, 'Pencarian alamat gagal. Ketuk peta untuk memilih titik.', { route: 'POST shop/api/places/autocomplete' });
  }
}
