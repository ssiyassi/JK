import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { collabApplicationMessage, createApplication } from '@/lib/shop/collabs';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, emailLinks, telegramCmo } from '@/lib/shop/server';

/** Influencer sign-up from the public page jentiskitchen.id/collab; the owner gets a Telegram alert. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.collabApply(clientIp(request))], now);
    const application = await createApplication(db, await readJson(request), now);
    log('info', 'shop_collab_application', { applicationId: application.id });
    await telegramCmo()(collabApplicationMessage(application, emailLinks().adminUrl));
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Gagal mengirim. Silakan coba lagi.', { route: 'POST shop/api/collab/apply' });
  }
}
