import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { createPasswordSetupToken, createSession, findCustomerByEmail, registerCustomer, SETUP_LINK_DAYS } from '@/lib/shop/customers';
import { passwordSetupEmail, welcomeEmail } from '@/lib/shop/email';
import { markEmailVerified } from '@/lib/shop/email-verify';
import { newCustomerDiscountUsed } from '@/lib/shop/new-customer';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { assertSameOrigin, clientIp, emailLinks, sendEmailsInBackground, setSessionCookie } from '@/lib/shop/server';
import { normalizeEmail } from '@/lib/shop/util';

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    await hitRateLimits(db, [LIMITS.register(clientIp(request))], now);
    const body = await readJson(request);
    // The account was made at a guest checkout and has no password yet: the only step left is a password, set from a
    // link sent to that inbox (so nobody can take over an account by typing someone else's email here).
    const existing = typeof body.email === 'string' && body.email.trim() ? await findCustomerByEmail(db, normalizeEmail(body.email)) : null;
    if (existing && !existing.hasPassword && existing.disabledAt === null) {
      await hitRateLimits(db, [LIMITS.forgotEmail(existing.email)], now);
      const token = await createPasswordSetupToken(db, existing.id, now);
      sendEmailsInBackground([passwordSetupEmail(existing.email, existing.name, token, SETUP_LINK_DAYS, emailLinks())]);
      log('info', 'shop_password_setup_sent', { customerId: existing.id });
      return NextResponse.json({ success: true, setupEmailSent: true });
    }
    const { customer } = await registerCustomer(db, body, now);
    const token = await createSession(db, customer.id, now);
    log('info', 'shop_customer_registered', { customerId: customer.id, referred: Boolean(customer.referredById) });
    // No email code at sign-up (owner's choice, 2026-10-22: the code step made customers drop off): the account counts
    // as confirmed and the welcome voucher is issued and emailed right away.
    // No welcome voucher when this phone or email already used the new-customer discount (e.g. as a guest).
    const used = await newCustomerDiscountUsed(db, { phones: [customer.phone], emails: [customer.email] });
    const welcome = await markEmailVerified(db, customer.id, now, !used);
    if (welcome) {
      const rules = await loadVoucherRules(db);
      sendEmailsInBackground([welcomeEmail(customer.email, customer.name, welcome, emailLinks(), rules.REFERRAL.percent)]);
    }
    const response = NextResponse.json({ success: true, welcome: Boolean(welcome) });
    setSessionCookie(response, request, token);
    return response;
  } catch (error) {
    return errorResponse(error, 'Pendaftaran gagal. Silakan coba lagi.', { route: 'POST shop/api/register' });
  }
}
