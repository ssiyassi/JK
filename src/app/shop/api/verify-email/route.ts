import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { emailCodeEmail, welcomeEmail } from '@/lib/shop/email';
import { createEmailCode, EMAIL_CODE_MINUTES, verifyEmailCode } from '@/lib/shop/email-verify';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { assertSameOrigin, emailLinks, requireCustomer, sendEmailsInBackground } from '@/lib/shop/server';

// Body: { action: 'send' } emails a new code; { action: 'verify', code } confirms the email and gives the welcome voucher.
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const customer = await requireCustomer();
    const body = await readJson(request);
    const db = getDB();
    const now = Date.now();
    if (body.action === 'send') {
      const code = await createEmailCode(db, customer, now);
      const rules = await loadVoucherRules(db);
      sendEmailsInBackground([emailCodeEmail(customer.email, customer.name, code, EMAIL_CODE_MINUTES, rules.WELCOME.percent)]);
      return NextResponse.json({ success: true });
    }
    if (body.action === 'verify') {
      const welcome = await verifyEmailCode(db, customer, body.code, now);
      log('info', 'shop_email_confirmed', { customerId: customer.id, welcome: Boolean(welcome) });
      if (welcome) {
        const rules = await loadVoucherRules(db);
        sendEmailsInBackground([welcomeEmail(customer.email, customer.name, welcome, emailLinks(), rules.REFERRAL.percent)]);
      }
      return NextResponse.json({ success: true });
    }
    throw new AppError(400, 'Permintaan tidak dikenal');
  } catch (error) {
    return errorResponse(error, 'Gagal. Silakan coba lagi.', { route: 'POST shop/api/verify-email' });
  }
}
