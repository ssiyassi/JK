import { NextRequest, NextResponse } from 'next/server';
import { getDB, log } from '@/lib/server';
import { verifyCallback } from '@/lib/shop/duitku';
import { onOrderPaid } from '@/lib/shop/events';
import { applyGatewayResult } from '@/lib/shop/payments';
import { afterAction, duitkuConfig, duitkuSandboxConfig, emailLinks, ownerEmail, paymentGateways, metaPurchase, telegram } from '@/lib/shop/server';

/**
 * Duitku calls this (https://jentiskitchen.id/api/payments/duitku/callback) when a payment finishes.
 * The signature proves the call comes from Duitku; only then is the order marked paid.
 * Duitku's signature does not cover the result code, so a "paid" callback is confirmed with Duitku's status API.
 * Test accounts pay through the Duitku sandbox, which calls the same URL with its own merchant code.
 */
export async function POST(request: NextRequest) {
  const configs = [duitkuConfig(), duitkuSandboxConfig()].filter((c) => c !== null);
  if (!configs.length) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  const body = await request.text();
  const verified = configs.map((config) => ({ config, result: verifyCallback(config, body) })).find((v) => v.result);
  if (!verified?.result) {
    log('warn', 'duitku_callback_bad_signature', {});
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }
  const { config, result } = verified;
  const gatewayName = config.sandboxLane ? 'duitku-sandbox' : 'duitku';
  const { invoiceNumber: invoice, reference } = result;
  let { status, amount } = result;
  try {
    const db = getDB();
    if (status === 'SUCCESS') {
      const gateway = paymentGateways().find((g) => g.name === gatewayName);
      const checked = gateway ? await gateway.checkStatus(invoice, Date.now()) : null;
      if (!checked || checked.status !== 'SUCCESS') {
        log('warn', 'duitku_callback_not_confirmed', { invoice, reference, checked: checked?.status ?? null });
        status = checked?.status ?? 'UNCONFIRMED';
      }
      if (checked) amount = checked.amount;
    }
    const applied = await applyGatewayResult(db, invoice, status, amount, Date.now(), gatewayName);
    log(applied.kind === 'ignored' ? 'warn' : 'info', 'duitku_callback', {
      gateway: gatewayName, invoice, status, amount, reference, result: applied.kind, reason: 'reason' in applied ? applied.reason : undefined,
    });
    if (applied.kind === 'paid') {
      afterAction('duitku_paid', () => onOrderPaid(db, applied.orderRowId, ownerEmail(), emailLinks(), Date.now(), telegram(), metaPurchase()));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    // 5xx makes Duitku retry the callback later.
    log('error', 'duitku_callback_failed', { invoice, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'temporary failure' }, { status: 500 });
  }
}
