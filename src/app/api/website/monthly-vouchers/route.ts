import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log } from '@/lib/server';
import { monthlyVoucherEmail } from '@/lib/shop/email';
import { emailLinks, sendEmails } from '@/lib/shop/server';
import { issueMonthlyVouchers, monthlyVoucherStats } from '@/lib/shop/vouchers';

/**
 * Gives every customer this month's 20% voucher and emails it. Safe to click again: nobody gets two vouchers
 * for the same month, and only vouchers whose email has not gone out yet are (re)sent.
 */
export async function POST(request: NextRequest) {
  try {
    const db = getDB();
    const now = Date.now();
    const links = emailLinks();
    const jobs = await issueMonthlyVouchers(db, now);
    const sent = await sendEmails(jobs.map((j) => monthlyVoucherEmail(j.email, j.name, j.voucher, links)));
    const stats = await monthlyVoucherStats(db, now);
    log('info', 'shop_monthly_vouchers', { period: stats.period, attempted: jobs.length, sent, user: actor(request) });
    return NextResponse.json({ success: true, attempted: jobs.length, sent, period: stats.period, customers: stats.customers, sentThisMonth: stats.sent });
  } catch (error) {
    return errorResponse(error, 'Failed to send monthly vouchers', { route: 'POST /api/website/monthly-vouchers', user: actor(request) });
  }
}
