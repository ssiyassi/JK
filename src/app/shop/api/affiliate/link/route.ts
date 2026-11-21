import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { getAffiliateByEmail } from '@/lib/shop/affiliates';
import { affiliateLinksEmail } from '@/lib/shop/email';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, emailLinks, sendEmailsInBackground } from '@/lib/shop/server';
import { normalizeEmail } from '@/lib/shop/util';

// "Lihat link & komisi saya" on jentiskitchen.id/affiliate: emails the affiliate their links again. Answers the same
// whether or not the email is registered, so the form cannot be used to find out who is an affiliate.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const db = getDB();
    await hitRateLimits(db, [LIMITS.affiliateLinkIp(clientIp(request)), LIMITS.affiliateLinkEmail(email)], Date.now());
    const affiliate = await getAffiliateByEmail(db, email);
    if (affiliate) sendEmailsInBackground([affiliateLinksEmail(affiliate, emailLinks(), 'reminder')]);
    log('info', 'shop_affiliate_link_request', { found: Boolean(affiliate) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Gagal mengirim email. Silakan coba lagi.', { route: 'POST shop/api/affiliate/link' });
  }
}
