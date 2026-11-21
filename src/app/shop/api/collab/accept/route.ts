import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { acceptCollab, collabAcceptedMessage } from '@/lib/shop/collabs';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, emailLinks, telegramCmo } from '@/lib/shop/server';

/** An influencer accepts the offer on their page (jentiskitchen.id/collab/<slug>); the owner gets a Telegram alert. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.collabAccept(clientIp(request))], now);
    const body = await readJson(request);
    const collab = await acceptCollab(db, String(body.slug ?? ''), body, now);
    log('info', 'shop_collab_accepted', { collabId: collab.id, campaign: collab.campaign });
    await telegramCmo()(collabAcceptedMessage(collab, emailLinks().adminUrl));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Gagal mengirim. Silakan coba lagi.', { route: 'POST shop/api/collab/accept' });
  }
}
