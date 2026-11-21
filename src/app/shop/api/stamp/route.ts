import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { stampCardsForPhone } from '@/lib/notify/stamps';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp } from '@/lib/shop/server';
import { normalizePhone } from '@/lib/shop/util';

/** Reseller stamp card (jentiskitchen.id/stamp): the cards of the resellers saved with this WhatsApp number. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.stampLookup(clientIp(request))], now);
    const body = await readJson(request);
    const cards = await stampCardsForPhone(db, normalizePhone(body.phone), now);
    if (!cards.length) throw new AppError(404, 'Nomor ini belum terdaftar sebagai reseller Jentis Kitchen. Hubungi admin ya.');
    return NextResponse.json({ cards });
  } catch (error) {
    return errorResponse(error, 'Gagal memuat kartu stamp. Silakan coba lagi.', { route: 'POST shop/api/stamp' });
  }
}
