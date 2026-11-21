import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { startPasswordReset } from '@/lib/shop/customers';
import { passwordResetEmail } from '@/lib/shop/email';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, emailLinks, sendEmailsInBackground } from '@/lib/shop/server';

// Answers the same whether or not the email has an account, so the form cannot be used to look up customers.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request);
    const db = getDB();
    const now = Date.now();
    // Per IP and per email, so the form cannot be used to flood someone's inbox.
    await hitRateLimits(db, [LIMITS.forgotIp(clientIp(request)), LIMITS.forgotEmail(String(body.email ?? ''))], now);
    const reset = await startPasswordReset(db, body.email, now);
    if (reset) sendEmailsInBackground([passwordResetEmail(reset.customer.email, reset.customer.name, reset.token, emailLinks())]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Gagal mengirim email. Silakan coba lagi.', { route: 'POST shop/api/forgot-password' });
  }
}
