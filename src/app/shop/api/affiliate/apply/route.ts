import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { affiliateSignupMessage, createAffiliate } from '@/lib/shop/affiliates';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { affiliateLinksEmail } from '@/lib/shop/email';
import { assertSameOrigin, clientIp, emailLinks, sendEmailsInBackground, telegramCmo } from '@/lib/shop/server';

/** Affiliate sign-up on jentiskitchen.id/affiliate: makes their link at once, emails it to them; the owner gets a Telegram alert. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.affiliateApply(clientIp(request))], now);
    const affiliate = await createAffiliate(db, await readJson(request), now);
    log('info', 'shop_affiliate_signup', { affiliateId: affiliate.id, code: affiliate.code });
    sendEmailsInBackground([affiliateLinksEmail(affiliate, emailLinks(), 'welcome')]);
    await telegramCmo()(affiliateSignupMessage(affiliate, emailLinks().adminUrl));
    return NextResponse.json({ success: true, slug: affiliate.slug });
  } catch (error) {
    return errorResponse(error, 'Gagal mendaftar. Silakan coba lagi.', { route: 'POST shop/api/affiliate/apply' });
  }
}
