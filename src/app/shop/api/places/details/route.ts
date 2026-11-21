import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { placeLocation } from '@/lib/shop/places';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, placesKey } from '@/lib/shop/server';

/** Location of the suggestion the customer picked (moves the pin). Body: { placeId, sessionToken }. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const key = placesKey();
    if (!key) throw new AppError(404, 'Pencarian alamat belum tersedia');
    const db = getDB();
    await hitRateLimits(db, [LIMITS.placesDetails(clientIp(request))], Date.now());
    const place = await placeLocation(key, await readJson(request), (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(6000) }));
    return NextResponse.json({ place });
  } catch (error) {
    return errorResponse(error, 'Lokasi tidak bisa diambil. Ketuk peta untuk memilih titik.', { route: 'POST shop/api/places/details' });
  }
}
