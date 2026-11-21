import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, readJson } from '@/lib/server';
import { createSession, loginCustomer } from '@/lib/shop/customers';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { assertSameOrigin, clientIp, setSessionCookie } from '@/lib/shop/server';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.login(clientIp(request))], now);
    const customer = await loginCustomer(db, await readJson(request), now);
    const token = await createSession(db, customer.id, now);
    const response = NextResponse.json({ success: true });
    setSessionCookie(response, request, token);
    return response;
  } catch (error) {
    return errorResponse(error, 'Gagal masuk. Silakan coba lagi.', { route: 'POST shop/api/login' });
  }
}
