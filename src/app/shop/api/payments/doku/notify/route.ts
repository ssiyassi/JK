import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { DOKU_NOTIFY_PATH, verifyNotification } from '@/lib/shop/doku';
import { onOrderPaid } from '@/lib/shop/events';
import { applyGatewayResult } from '@/lib/shop/payments';
import { afterAction, dokuConfig, emailLinks, ownerEmail, metaPurchase, telegram } from '@/lib/shop/server';

/**
 * DOKU calls this (https://jentiskitchen.id/api/payments/doku/notify) when a payment finishes.
 * The signature proves the call comes from DOKU; only then is the order marked paid.
 */
export async function POST(request: NextRequest) {
  const doku = dokuConfig();
  if (!doku) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  const raw = await request.text(); // the signature covers these exact bytes
  // The path DOKU called, as the customer-facing URL (on preview the shop lives under /shop).
  const target = new URL(emailLinks().shopUrl).pathname.replace(/\/$/, '') + DOKU_NOTIFY_PATH;
  if (!(await verifyNotification(doku, request.headers, raw, target))) {
    log('warn', 'doku_notify_bad_signature', { requestId: request.headers.get('request-id') });
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: Record<string, any> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const invoice = String(body?.order?.invoice_number ?? '');
  const status = String(body?.transaction?.status ?? '');
  const amount = Number(body?.order?.amount);
  try {
    const db = getDB();
    const result = await applyGatewayResult(db, invoice, status, amount, Date.now(), 'doku');
    log(result.kind === 'ignored' ? 'warn' : 'info', 'doku_notify', { invoice, status, amount, result: result.kind, reason: 'reason' in result ? result.reason : undefined });
    if (result.kind === 'paid') {
      afterAction('doku_paid', () => onOrderPaid(db, result.orderRowId, ownerEmail(), emailLinks(), Date.now(), telegram(), metaPurchase()));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    // 5xx makes DOKU retry the notification later.
    log('error', 'doku_notify_failed', { invoice, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'temporary failure' }, { status: 500 });
  }
}
