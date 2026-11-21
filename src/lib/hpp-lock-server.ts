// Next.js glue for the HPP email-code lock (see core/hpp-lock.ts).
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { AppError } from './core/d1';
import { HPP_COOKIE, UNLOCK_HOURS, isUnlocked } from './core/hpp-lock';
import { getDB } from './server';

export async function hppUnlocked(): Promise<boolean> {
  return isUnlocked(getDB(), (await cookies()).get(HPP_COOKIE)?.value);
}

export async function requireHppUnlocked(request: NextRequest): Promise<void> {
  if (!(await isUnlocked(getDB(), request.cookies.get(HPP_COOKIE)?.value))) {
    throw new AppError(401, 'Locked: open the HPP page and enter the email code first');
  }
}

export function setHppCookie(response: NextResponse, request: NextRequest, token: string) {
  response.cookies.set(HPP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: UNLOCK_HOURS * 3600,
  });
}

export function clearHppCookie(response: NextResponse) {
  response.cookies.set(HPP_COOKIE, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
}
