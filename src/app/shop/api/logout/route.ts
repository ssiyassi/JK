import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB } from '@/lib/server';
import { deleteSession } from '@/lib/shop/customers';
import { assertSameOrigin, clearSessionCookie, SESSION_COOKIE } from '@/lib/shop/server';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    await deleteSession(getDB(), request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ success: true });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return errorResponse(error, 'Gagal keluar', { route: 'POST shop/api/logout' });
  }
}
