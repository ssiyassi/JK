import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { HPP_COOKIE, HPP_OTP_EMAIL, createOtp, lock, verifyOtp } from '@/lib/core/hpp-lock';
import { hppOtpEmail } from '@/lib/shop/email';
import { sendEmails } from '@/lib/shop/server';
import { clearHppCookie, setHppCookie } from '@/lib/hpp-lock-server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';

// HPP lock. Body: { action: 'send' } emails a code, { action: 'verify', code } unlocks, { action: 'lock' } locks again.
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const db = getDB();
    if (body.action === 'send') {
      const code = await createOtp(db);
      const sent = await sendEmails([hppOtpEmail(HPP_OTP_EMAIL, code)]);
      log('info', 'hpp_otp_sent', { sent, user: actor(request) });
      if (!sent) throw new AppError(502, 'The email could not be sent. Try again in a minute.');
      return NextResponse.json({ success: true });
    }
    if (body.action === 'verify') {
      const token = await verifyOtp(db, body.code);
      log('info', 'hpp_unlocked', { user: actor(request) });
      const response = NextResponse.json({ success: true });
      setHppCookie(response, request, token);
      return response;
    }
    if (body.action === 'lock') {
      await lock(db, request.cookies.get(HPP_COOKIE)?.value);
      const response = NextResponse.json({ success: true });
      clearHppCookie(response);
      return response;
    }
    throw new AppError(400, 'Unknown action');
  } catch (error) {
    if (error instanceof AppError && error.status === 400) log('warn', 'hpp_otp_refused', { message: error.message, user: actor(request) });
    return errorResponse(error, 'Something went wrong', { route: 'POST /api/hpp/otp', user: actor(request) });
  }
}
