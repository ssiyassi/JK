import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { createSession, finishPasswordReset } from '@/lib/shop/customers';
import { welcomeEmail } from '@/lib/shop/email';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, emailLinks, sendEmailsInBackground, setSessionCookie } from '@/lib/shop/server';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.reset(clientIp(request))], now);
    const { customer, welcome } = await finishPasswordReset(db, await readJson(request), now);
    const token = await createSession(db, customer.id, now);
    // The reset link came from their inbox: a not-yet-confirmed email is now confirmed and gets the welcome voucher.
    if (welcome) {
      const rules = await loadVoucherRules(db);
      sendEmailsInBackground([welcomeEmail(customer.email, customer.name, welcome, emailLinks(), rules.REFERRAL.percent)]);
    }
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, request, token);
    return response;
  } catch (error) {
    return errorResponse(error, 'Gagal mengganti password. Silakan coba lagi.', { route: 'POST shop/api/reset-password' });
  }
}
