// Payment flow (DOKU, Duitku) against fake gateways that check signatures. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { registerCustomer } from '../src/lib/shop/customers.ts';
import { markEmailVerified } from '../src/lib/shop/email-verify.ts';
import { placeOrder, getShopOrder, parsePaymentMethod, saveProof, setPaymentMethod } from '../src/lib/shop/orders.ts';
import { dokuDigest, dokuGateway, dokuSignature, dokuText, parseDokuExpiry, verifyNotification, type FetchLike } from '../src/lib/shop/doku.ts';
import { duitkuGateway, verifyCallback } from '../src/lib/shop/duitku.ts';
import { gatewayForMethod, paymentGatewaysFromEnv } from '../src/lib/shop/config.ts';
import { applyGatewayResult, paymentLinkFor, syncOrderPayment, listPayments, PAYMENT_DUE_MINUTES } from '../src/lib/shop/payments.ts';
import { alertUnpaidOrders, cancelByCustomer, expireUnpaidOrders, EXPIRE_AFTER_MS, ownerQrisLink, TRANSFER_EXPIRE_AFTER_MS } from '../src/lib/shop/events.ts';
import { listCustomerVouchers } from '../src/lib/shop/vouchers.ts';
import { createOwnerLinkToken, markOwnerOrder, ownerAttribution, ownerForSession, payLinkWhatsApp, redeemOwnerLinkToken } from '../src/lib/shop/ownerOrders.ts';
import { getInventory } from '../src/lib/core/inventory.ts';

const cfg = { clientId: 'BRN-TEST-0001', secretKey: 'SK-test-secret', baseUrl: 'https://api-sandbox.doku.com' };
const links = { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' };

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-pay-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0026_order_attribution.sql', '0028_guest_checkout.sql', '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 10, 10, 10, 10, 0);`);
  return db;
}

function dokuDate(ms: number): string {
  return new Date(ms + 7 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** A fake DOKU: rejects bad signatures, remembers created invoices, reports their status. */
function fakeDoku() {
  const created: Record<string, any>[] = [];
  const statuses: Record<string, { status: string; amount: number }> = {};
  const fetchImpl: FetchLike = async (url, init) => {
    const target = new URL(url).pathname;
    const h = init.headers;
    const expected = await dokuSignature(cfg.secretKey, {
      clientId: h['Client-Id'], requestId: h['Request-Id'], timestamp: h['Request-Timestamp'], target, body: init.body,
    });
    assert.equal(h.Signature, expected, 'signature');
    assert.match(h['Request-Timestamp'], /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    if (init.method === 'POST' && target === '/checkout/v1/payment') {
      const body = JSON.parse(init.body!);
      created.push(body);
      const inv = body.order.invoice_number;
      statuses[inv] = { status: 'PENDING', amount: body.order.amount };
      return { ok: true, status: 200, text: async () => JSON.stringify({
        message: ['SUCCESS'],
        // Like DOKU: the link expires payment_due_date minutes after the request, as yyyyMMddHHmmss Jakarta time.
        response: { payment: { url: `https://sandbox.doku.com/checkout/link/${inv}`, expired_date: dokuDate(Date.parse(h['Request-Timestamp']) + body.payment.payment_due_date * 60000) } },
      }) };
    }
    const inv = decodeURIComponent(target.split('/').pop()!);
    const s = statuses[inv];
    if (!s) return { ok: false, status: 404, text: async () => '{}' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ order: { invoice_number: inv, amount: s.amount }, transaction: { status: s.status } }) };
  };
  return { fetchImpl, created, statuses };
}

async function setup() {
  const db = freshDb();
  const now = Date.parse('2026-10-13T07:00:00Z');
  const { customer } = await registerCustomer(db, { name: 'Rini', email: 'rini@example.test', phone: '081234567890', password: 'rahasia123' }, now);
  const { order } = await placeOrder(db, customer, {
    items: { babiManis: 1 },
    address: { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' },
  }, null, now);
  return { db, now, customer, order };
}

test('signature: components joined by newlines, digest only for POST', async () => {
  const body = '{"a":1}';
  const sig = await dokuSignature('secret', { clientId: 'C', requestId: 'R', timestamp: 'T', target: '/x', body });
  assert.match(sig, /^HMACSHA256=[A-Za-z0-9+/]+=*$/);
  assert.notEqual(sig, await dokuSignature('secret', { clientId: 'C', requestId: 'R', timestamp: 'T', target: '/x' }));
  assert.equal(await dokuDigest(''), '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='); // SHA-256 of empty string
  assert.equal(parseDokuExpiry('20261013160000'), Date.parse('2026-10-13T09:00:00Z')); // 16:00 WIB
  assert.equal(dokuText('Pesanan #12 — Siti & "Budi" 😀', 255), 'Pesanan 12 Siti Budi');
  assert.equal(dokuText("O'Neil (Bu) a@b.id", 255), "O'Neil (Bu) a@b.id");
  assert.equal(dokuText('###', 255), '-');
});

test('payment link: created once with the order total, reused, new invoice after expiry', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const url = await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now);
  assert.equal(url, `https://sandbox.doku.com/checkout/link/JK${order.orderId}`);
  const sent = doku.created[0];
  assert.equal(sent.order.amount, 175000); // 160,000 + 15,000 delivery
  assert.equal(sent.order.line_items[0].price * sent.order.line_items[0].quantity, sent.order.amount);
  assert.equal(sent.customer.phone, '6281234567890');
  assert.deepEqual(sent.payment.payment_method_types, ['QRIS']);
  assert.ok(sent.order.invoice_number.length <= 30); // DOKU limit when cards are enabled
  for (const text of [sent.order.line_items[0].name, sent.customer.name]) assert.match(text, /^[a-zA-Z0-9.\-\/+,=_:'@%() ]+$/);
  assert.equal(sent.additional_info.override_notification_url, 'https://jentiskitchen.id/api/payments/doku/notify');
  assert.equal(sent.order.callback_url, `https://jentiskitchen.id/orders/${order.orderRowId}?from=doku`);

  assert.equal(await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now + 60000), url); // reused
  assert.equal(doku.created.length, 1);
  const later = await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, Date.parse('2026-10-13T09:30:00Z'));
  assert.equal(later, `https://sandbox.doku.com/checkout/link/JK${order.orderId}R2`);
});

test('gateway result: only SUCCESS with the exact amount marks paid, once', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now);
  const inv = `JK${order.orderId}`;
  assert.equal((await applyGatewayResult(db, inv, 'FAILED', 175000, now)).kind, 'ignored');
  assert.equal((await applyGatewayResult(db, inv, 'SUCCESS', 1000, now)).kind, 'ignored'); // wrong amount
  assert.equal((await applyGatewayResult(db, 'JKUNKNOWN', 'SUCCESS', 175000, now)).kind, 'ignored');
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PENDING');
  assert.deepEqual(await applyGatewayResult(db, inv, 'SUCCESS', 175000, now), { kind: 'paid', orderRowId: order.orderRowId });
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PAID');
  assert.equal((await applyGatewayResult(db, inv, 'SUCCESS', 175000, now)).kind, 'already-paid');
  await assert.rejects(paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), (await getShopOrder(db, order.orderRowId))!, customer, links, now), /sudah dibayar/);
});

test('status check backup: picks up a payment whose notification was lost', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now);
  assert.deepEqual(await syncOrderPayment(db, [dokuGateway(cfg, doku.fetchImpl)], order.orderRowId, now), [{ kind: 'ignored', reason: 'status PENDING' }]);
  doku.statuses[`JK${order.orderId}`].status = 'SUCCESS';
  const r = await syncOrderPayment(db, [dokuGateway(cfg, doku.fetchImpl)], order.orderRowId, now);
  assert.equal(r[0].kind, 'paid');
  assert.equal((await listPayments(db, order.orderRowId))[0].status, 'SUCCESS');
  assert.deepEqual(await syncOrderPayment(db, [dokuGateway(cfg, doku.fetchImpl)], order.orderRowId, now), []); // nothing open any more
});

test('notification signature: accepts DOKU-signed body, rejects tampering and other client ids', async () => {
  const body = JSON.stringify({ order: { invoice_number: 'JK1', amount: 175000 }, transaction: { status: 'SUCCESS' } });
  const h = { 'client-id': cfg.clientId, 'request-id': 'r-1', 'request-timestamp': '2026-10-13T07:00:00Z' } as Record<string, string>;
  h.signature = await dokuSignature(cfg.secretKey, {
    clientId: cfg.clientId, requestId: 'r-1', timestamp: h['request-timestamp'], target: '/api/payments/doku/notify', body,
  });
  const headers = { get: (n: string) => h[n.toLowerCase()] ?? null };
  assert.equal(await verifyNotification(cfg, headers, body, '/api/payments/doku/notify'), true);
  assert.equal(await verifyNotification(cfg, headers, body.replace('175000', '1'), '/api/payments/doku/notify'), false);
  assert.equal(await verifyNotification(cfg, headers, body, '/other'), false);
  assert.equal(await verifyNotification({ ...cfg, clientId: 'BRN-OTHER' }, headers, body, '/api/payments/doku/notify'), false);
});

test('expiry: unpaid orders are cancelled after the payment deadline; late payments and open links are respected', async () => {
  const { db, now, customer, order } = await setup(); // order placed at `now`, 1 × Babi Manis
  const doku = fakeDoku();
  await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now);
  const before = (await getInventory(db)).quantities.babiManis;

  // Too early: nothing happens.
  let r = await expireUnpaidOrders(db, [dokuGateway(cfg, doku.fetchImpl)], links, 'owner@x.id', now + 60 * 60000);
  assert.deepEqual([r.cancelled, r.paid], [[], []]);

  // After the deadline: cancelled, customer emailed (expired reason). It never took stock, so stock is unchanged.
  const later = now + EXPIRE_AFTER_MS + 60000;
  r = await expireUnpaidOrders(db, [dokuGateway(cfg, doku.fetchImpl)], links, 'owner@x.id', later);
  assert.deepEqual(r.cancelled, [order.orderRowId]);
  assert.equal(r.emails.length, 1);
  assert.match(r.emails[0].subject, /pembayaran kedaluwarsa/);
  assert.equal((await getInventory(db)).quantities.babiManis, before);
  const cancelled = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(cancelled.orderStatus, 'CANCELLED');
  assert.equal(cancelled.cancelReason, 'EXPIRED');
  r = await expireUnpaidOrders(db, [dokuGateway(cfg, doku.fetchImpl)], links, 'owner@x.id', later); // runs again: nothing new
  assert.deepEqual([r.cancelled, r.emails], [[], []]);
});

test('expiry: a payment DOKU confirms at the last moment is recorded instead of cancelled', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, now);
  doku.statuses[`JK${order.orderId}`].status = 'SUCCESS'; // paid, but the notification never arrived
  const r = await expireUnpaidOrders(db, [dokuGateway(cfg, doku.fetchImpl)], links, 'owner@x.id', now + EXPIRE_AFTER_MS + 60000);
  assert.deepEqual(r.paid, [order.orderRowId]);
  assert.deepEqual(r.cancelled, []);
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PAID');
  assert.deepEqual(r.emails.map((e) => e.to), ['rini@example.test', 'owner@x.id']);
});

test('expiry: an order whose customer opened a new payment link late is not cancelled while that link is open', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const lateOpen = now + 2 * 60 * 60000; // customer comes back after 2 hours and opens a fresh link
  await paymentLinkFor(db, dokuGateway(cfg, doku.fetchImpl), order, customer, links, lateOpen);
  const r = await expireUnpaidOrders(db, [dokuGateway(cfg, doku.fetchImpl)], links, null, now + EXPIRE_AFTER_MS + 60000);
  assert.deepEqual(r.cancelled, []);
  assert.equal((await getShopOrder(db, order.orderRowId))!.orderStatus, 'ACTIVE');
});

// ---------------- Duitku ----------------

const dcfg = { merchantCode: 'DS00001', apiKey: 'duitku-test-key', production: false };
const md5 = (x: string) => createHash('md5').update(x).digest('hex');

/** A fake Duitku POP: checks signatures, remembers invoices; unknown to the status API until a method is picked. */
function fakeDuitku() {
  const created: Record<string, any>[] = [];
  const statuses: Record<string, { statusCode: string; amount: string }> = {};
  const fetchImpl: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body!);
    if (url === 'https://api-sandbox.duitku.com/api/merchant/createInvoice') {
      const h = init.headers;
      assert.equal(h['x-duitku-merchantcode'], dcfg.merchantCode);
      assert.equal(h['x-duitku-signature'], createHash('sha256').update(dcfg.merchantCode + h['x-duitku-timestamp'] + dcfg.apiKey).digest('hex'));
      created.push(body);
      return { ok: true, status: 200, text: async () => JSON.stringify({
        merchantCode: dcfg.merchantCode, reference: `REF${body.merchantOrderId}`, statusCode: '00', statusMessage: 'SUCCESS',
        paymentUrl: `https://app-sandbox.duitku.com/redirect_checkout?reference=REF${body.merchantOrderId}`, amount: `${body.paymentAmount}.00`,
      }) };
    }
    assert.equal(url, 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus');
    assert.equal(body.signature, md5(dcfg.merchantCode + body.merchantOrderId + dcfg.apiKey));
    const st = statuses[body.merchantOrderId];
    if (!st) return { ok: false, status: 404, text: async () => '{"Message":"Transaction not found"}' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ merchantOrderId: body.merchantOrderId, ...st }) };
  };
  return { fetchImpl, created, statuses };
}

test('duitku: payment link, then status check marks the order paid', async () => {
  const { db, now, customer, order } = await setup();
  const duitku = fakeDuitku();
  const gw = duitkuGateway(dcfg, duitku.fetchImpl);
  const url = await paymentLinkFor(db, gw, order, customer, links, now);
  assert.equal(url, `https://app-sandbox.duitku.com/redirect_checkout?reference=REFJK${order.orderId}`);
  const sent = duitku.created[0];
  assert.equal(sent.paymentAmount, order.total);
  assert.equal(sent.merchantOrderId, `JK${order.orderId}`);
  assert.equal(sent.itemDetails[0].price, order.total);
  assert.equal(sent.callbackUrl, 'https://jentiskitchen.id/api/payments/duitku/callback');
  assert.equal(sent.returnUrl, `https://jentiskitchen.id/orders/${order.orderRowId}?from=duitku`);
  assert.equal(sent.expiryPeriod, 120);
  assert.equal((await listPayments(db, order.orderRowId))[0].gateway, 'duitku');
  assert.equal(await paymentLinkFor(db, gw, order, customer, links, now + 60000), url); // reused

  assert.deepEqual(await syncOrderPayment(db, [gw], order.orderRowId, now), []); // no method picked yet
  duitku.statuses[`JK${order.orderId}`] = { statusCode: '01', amount: String(order.total) };
  assert.deepEqual(await syncOrderPayment(db, [gw], order.orderRowId, now), [{ kind: 'ignored', reason: 'status PENDING' }]);
  duitku.statuses[`JK${order.orderId}`].statusCode = '00';
  assert.deepEqual(await syncOrderPayment(db, [gw], order.orderRowId, now), [{ kind: 'paid', orderRowId: order.orderRowId }]);
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PAID');
});

test('duitku: callback signature over the values as sent; tampering and other merchants are rejected', () => {
  const form = (amount: string, invoice: string, code = dcfg.merchantCode, key = dcfg.apiKey) =>
    new URLSearchParams({ merchantCode: code, amount, merchantOrderId: invoice, resultCode: '00', reference: 'R1', signature: md5(code + amount + invoice + key) }).toString();
  assert.deepEqual(verifyCallback(dcfg, form('175000', 'JK1')), { invoiceNumber: 'JK1', status: 'SUCCESS', amount: 175000, reference: 'R1' });
  assert.equal(verifyCallback(dcfg, form('175000', 'JK1').replace('amount=175000', 'amount=1')), null);
  assert.equal(verifyCallback(dcfg, form('175000', 'JK1', 'DS99999')), null);
  assert.equal(verifyCallback(dcfg, form('175000', 'JK1', dcfg.merchantCode, 'wrong-key')), null);
  assert.equal(verifyCallback(dcfg, ''), null);
  const failed = new URLSearchParams(form('175000', 'JK1'));
  failed.set('resultCode', '01');
  assert.equal(verifyCallback(dcfg, failed.toString())!.status, 'PENDING');
});

test('switching gateway: a new link comes from the new gateway; old invoices are still checked with the old one', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const duitku = fakeDuitku();
  const dokuGw = dokuGateway(cfg, doku.fetchImpl);
  const duitkuGw = duitkuGateway(dcfg, duitku.fetchImpl);
  await paymentLinkFor(db, dokuGw, order, customer, links, now);
  const url = await paymentLinkFor(db, duitkuGw, order, customer, links, now + 60000);
  assert.match(url, /duitku/);
  assert.equal(duitku.created[0].merchantOrderId, `JK${order.orderId}R2`);
  doku.statuses[`JK${order.orderId}`].status = 'SUCCESS'; // customer paid the old DOKU link after all
  const r = await syncOrderPayment(db, [duitkuGw, dokuGw], order.orderRowId, now);
  assert.deepEqual(r, [{ kind: 'paid', orderRowId: order.orderRowId }]);
});

test('gateway choice from settings: PAYMENT_GATEWAY first, unconfigured ones left out', () => {
  const f: FetchLike = async () => ({ ok: true, status: 200, text: async () => '' });
  const both = { DOKU_CLIENT_ID: 'c', DOKU_SECRET_KEY: 's', DUITKU_MERCHANT_CODE: 'm', DUITKU_API_KEY: 'k' };
  assert.deepEqual(paymentGatewaysFromEnv(both, f).map((g) => g.name), ['doku', 'duitku']);
  assert.deepEqual(paymentGatewaysFromEnv({ ...both, PAYMENT_GATEWAY: 'duitku' }, f).map((g) => g.name), ['duitku', 'doku']);
  assert.deepEqual(paymentGatewaysFromEnv({ DUITKU_MERCHANT_CODE: 'm', DUITKU_API_KEY: 'k' }, f).map((g) => g.name), ['duitku']);
  assert.deepEqual(paymentGatewaysFromEnv({}, f), []);
});

// ---------------- Customer cancels an unpaid order ----------------

test('customer cancel: unpaid order is cancelled, its voucher is available again at once', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-13T07:00:00Z');
  const { customer } = await registerCustomer(db, { name: 'Rini', email: 'rini@example.test', phone: '081234567890', password: 'rahasia123' }, now);
  await markEmailVerified(db, customer.id, now);
  const welcome = (await listCustomerVouchers(db, customer.id, now)).find((v) => v.status === 'AVAILABLE')!;
  const { order } = await placeOrder(db, customer, {
    items: { babiManis: 2 },
    voucherCode: welcome.code,
    address: { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' },
  }, null, now);
  assert.equal((await listCustomerVouchers(db, customer.id, now)).find((v) => v.code === welcome.code)!.status, 'USED');
  const doku = fakeDoku();
  const gws = [dokuGateway(cfg, doku.fetchImpl)];
  await paymentLinkFor(db, gws[0], order, customer, links, now);

  const { customer: other } = await registerCustomer(db, { name: 'Budi', email: 'budi@example.test', phone: '081234567891', password: 'rahasia123' }, now);
  await assert.rejects(cancelByCustomer(db, gws, order.orderRowId, other.id, links, null, now), /tidak ditemukan/);

  const r = await cancelByCustomer(db, gws, order.orderRowId, customer.id, links, null, now + 60000);
  assert.equal(r.result, 'cancelled');
  assert.match(r.emails[0].subject, /dibatalkan/);
  const cancelled = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(cancelled.orderStatus, 'CANCELLED');
  assert.equal(cancelled.cancelReason, 'CUSTOMER');
  assert.equal((await listCustomerVouchers(db, customer.id, now)).find((v) => v.code === welcome.code)!.status, 'AVAILABLE');
  assert.equal((await cancelByCustomer(db, gws, order.orderRowId, customer.id, links, null, now)).result, 'already-cancelled');
});

test('customer cancel: an order the gateway reports as paid is recorded as paid, not cancelled', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const gws = [dokuGateway(cfg, doku.fetchImpl)];
  await paymentLinkFor(db, gws[0], order, customer, links, now);
  doku.statuses[`JK${order.orderId}`].status = 'SUCCESS'; // paid moments ago, notification not here yet
  const r = await cancelByCustomer(db, gws, order.orderRowId, customer.id, links, 'owner@x.id', now);
  assert.equal(r.result, 'paid');
  const o = (await getShopOrder(db, order.orderRowId))!;
  assert.deepEqual([o.orderStatus, o.paymentStatus], ['ACTIVE', 'PAID']);
  await assert.rejects(cancelByCustomer(db, gws, order.orderRowId, customer.id, links, null, now), /sudah dibayar/);
});

test('owner QRIS: the QRIS page of the order, reused; refused when paid, cancelled or without DOKU', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const gateway = dokuGateway(cfg, doku.fetchImpl);
  const { url } = await ownerQrisLink(db, gateway, order.orderRowId, links, now);
  assert.equal(url, `https://sandbox.doku.com/checkout/link/JK${order.orderId}`);
  assert.deepEqual(doku.created[0].payment.payment_method_types, ['QRIS']);
  assert.equal(doku.created[0].customer.email, customer.email);
  assert.equal((await ownerQrisLink(db, gateway, order.orderRowId, links, now + 60000)).url, url); // same link as the customer's
  assert.equal(doku.created.length, 1);
  await assert.rejects(ownerQrisLink(db, null, order.orderRowId, links, now), /needs the DOKU/);
  await assert.rejects(ownerQrisLink(db, gateway, 'missing', links, now), /not found/);
  await applyGatewayResult(db, `JK${order.orderId}`, 'SUCCESS', 175000, now);
  await assert.rejects(ownerQrisLink(db, gateway, order.orderRowId, links, now), /already paid/);
});

test('unpaid alert: once per order, 15 minutes after it was placed, never when paid', async () => {
  const { db, now, order } = await setup();
  const sent: string[] = [];
  const telegram = async (text: string) => {
    sent.push(text);
  };
  assert.deepEqual(await alertUnpaidOrders(db, links, now + 14 * 60000, telegram), []); // too early
  assert.deepEqual(await alertUnpaidOrders(db, links, now + 16 * 60000, telegram), [order.orderRowId]);
  assert.match(sent[0], new RegExp(`NOT PAID yet \\(16 min\\)\\nOrder ${order.orderId} · placed 14:00 WIB`));
  assert.match(sent[0], /Total: Rp 175\.000/);
  assert.match(sent[0], /https:\/\/admin\.jentiskitchen\.id\/orders/);
  assert.deepEqual(await alertUnpaidOrders(db, links, now + 31 * 60000, telegram), []); // only once
  assert.equal(sent.length, 1);
  assert.deepEqual(await alertUnpaidOrders(db, links, now + 4 * 3600000, telegram), []); // too old anyway

  const second = await setup();
  await second.db.prepare(`UPDATE orders SET paymentStatus = 'PAID'`).run();
  assert.deepEqual(await alertUnpaidOrders(second.db, links, second.now + 16 * 60000, telegram), []);
});

// ---------------- Manual BCA transfer ----------------

test('manual transfer: 24 hours to upload the proof; with a proof the order is never auto-cancelled', async () => {
  const { db, now, customer, order } = await setup();
  const gws: never[] = [];
  await setPaymentMethod(db, customer.id, order.orderRowId, 'TRANSFER');
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentMethod, 'TRANSFER');

  // Past the QRIS deadline but within 24 hours: still open.
  let r = await expireUnpaidOrders(db, gws, links, null, now + EXPIRE_AFTER_MS + 60 * 60000);
  assert.deepEqual(r.cancelled, []);
  // After 24 hours without a proof: cancelled.
  r = await expireUnpaidOrders(db, gws, links, null, now + TRANSFER_EXPIRE_AFTER_MS + 60000);
  assert.deepEqual(r.cancelled, [order.orderRowId]);

  // A second order with a proof uploaded: never cancelled, even long after.
  const { order: o2 } = await placeOrder(db, customer, {
    items: { babiManis: 1 },
    address: { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' },
  }, null, now);
  await setPaymentMethod(db, customer.id, o2.orderRowId, 'TRANSFER');
  await saveProof(db, customer.id, o2.orderRowId, 'data:image/jpeg;base64,/9j/AAAA', now + 60000);
  r = await expireUnpaidOrders(db, gws, links, null, now + 3 * TRANSFER_EXPIRE_AFTER_MS);
  assert.deepEqual(r.cancelled, []);
  assert.equal((await getShopOrder(db, o2.orderRowId))!.orderStatus, 'ACTIVE');
});

test('manual transfer: QRIS orders keep the short deadline; switching method needs the owner of the order', async () => {
  const { db, now, customer, order } = await setup();
  await setPaymentMethod(db, customer.id, order.orderRowId, 'QRIS');
  const { customer: other } = await registerCustomer(db, { name: 'Budi', email: 'budi@example.test', phone: '081234567891', password: 'rahasia123' }, now);
  await assert.rejects(setPaymentMethod(db, other.id, order.orderRowId, 'TRANSFER'), /tidak ditemukan/);
  const r = await expireUnpaidOrders(db, [], links, null, now + EXPIRE_AFTER_MS + 60000);
  assert.deepEqual(r.cancelled, [order.orderRowId]);
  await assert.rejects(setPaymentMethod(db, customer.id, order.orderRowId, 'TRANSFER'), /dibatalkan/);
});

test('transfer proof: PDF accepted up to ~1.3 MB, other file types refused', async () => {
  const { db, now, customer, order } = await setup();
  const pdf = (bytes: number) => `data:application/pdf;base64,${Buffer.alloc(bytes, 1).toString('base64')}`;
  const { order: saved } = await saveProof(db, customer.id, order.orderRowId, pdf(200_000), now);
  assert.notEqual(saved.proofUploadedAt, null);
  await assert.rejects(saveProof(db, customer.id, order.orderRowId, pdf(1_400_000), now), /PDF terlalu besar/);
  await assert.rejects(saveProof(db, customer.id, order.orderRowId, 'data:text/html;base64,PGgxPg==', now), /gambar \(JPG\/PNG\) atau PDF/);
});

// ---------------- OVO through Duitku, next to QRIS through DOKU ----------------

test('OVO: QRIS stays on DOKU, OVO goes to Duitku only; no Duitku key = no OVO', () => {
  const f: FetchLike = async () => ({ ok: true, status: 200, text: async () => '' });
  const both = { DOKU_CLIENT_ID: 'c', DOKU_SECRET_KEY: 's', DUITKU_MERCHANT_CODE: 'm', DUITKU_API_KEY: 'k', PAYMENT_GATEWAY: 'doku' };
  assert.equal(gatewayForMethod(both, 'QRIS', 'a@b.id', f)?.name, 'doku');
  assert.equal(gatewayForMethod(both, 'OVO', 'a@b.id', f)?.name, 'duitku');
  const noKey = { ...both, DUITKU_API_KEY: undefined };
  assert.equal(gatewayForMethod(noKey, 'QRIS', 'a@b.id', f)?.name, 'doku');
  assert.equal(gatewayForMethod(noKey, 'OVO', 'a@b.id', f), null);
  const sandbox = { ...both, SANDBOX_TEST_EMAILS: 'test@b.id', DUITKU_SANDBOX_MERCHANT_CODE: 'DS1', DUITKU_SANDBOX_API_KEY: 'x' };
  assert.equal(gatewayForMethod(sandbox, 'OVO', 'test@b.id', f)?.name, 'duitku-sandbox');
  assert.equal(gatewayForMethod(sandbox, 'OVO', 'a@b.id', f)?.name, 'duitku');
});

test('OVO: the Duitku page opens on OVO only; QRIS invoices stay unrestricted; a failed attempt gets a new link', async () => {
  const { db, now, customer, order } = await setup();
  const duitku = fakeDuitku();
  const gw = duitkuGateway(dcfg, duitku.fetchImpl);
  const ovoOrder = await setPaymentMethod(db, customer.id, order.orderRowId, 'OVO');
  const first = await paymentLinkFor(db, gw, ovoOrder, customer, links, now);
  assert.equal(duitku.created[0].paymentMethod, 'OV');
  assert.equal(duitku.created[0].expiryPeriod, 3);

  duitku.statuses[`JK${order.orderId}`] = { statusCode: '02', amount: String(order.total) }; // declined in the OVO app
  const r = await syncOrderPayment(db, [gw], order.orderRowId, now + 120000);
  assert.equal(r[0].kind, 'ignored');
  const second = await paymentLinkFor(db, gw, ovoOrder, customer, links, now + 180000);
  assert.notEqual(second, first);
  assert.equal(duitku.created[1].merchantOrderId, `JK${order.orderId}R2`);
  assert.equal(duitku.created[1].paymentMethod, 'OV');

  // Paid on the second try: the order is paid.
  duitku.statuses[`JK${order.orderId}R2`] = { statusCode: '00', amount: String(order.total) };
  const paid = await syncOrderPayment(db, [gw], order.orderRowId, now + 240000);
  assert.equal(paid[0].kind, 'paid');
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PAID');

  const { order: qrisOrder } = await placeOrder(db, customer, {
    items: { babiManis: 1 },
    address: { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' },
  }, null, now);
  await paymentLinkFor(db, gw, qrisOrder, customer, links, now);
  assert.equal(duitku.created[2].paymentMethod, undefined);
});

test('ShopeePay: the Duitku page opens on ShopeePay Apps with the normal 2-hour link; not cancelled on the OVO clock', async () => {
  const { db, now, customer, order } = await setup();
  const duitku = fakeDuitku();
  const gw = duitkuGateway(dcfg, duitku.fetchImpl);
  const spOrder = await setPaymentMethod(db, customer.id, order.orderRowId, 'SHOPEEPAY');
  assert.equal(spOrder.paymentMethod, 'SHOPEEPAY');
  await paymentLinkFor(db, gw, spOrder, customer, links, now);
  assert.equal(duitku.created[0].paymentMethod, 'SA');
  assert.equal(duitku.created[0].expiryPeriod, PAYMENT_DUE_MINUTES);

  // Ten minutes later the link is still open: nothing is cancelled (OVO orders would be by now).
  const r = await expireUnpaidOrders(db, [gw], links, null, now + 10 * 60000);
  assert.deepEqual(r.cancelled, []);
  assert.equal(parsePaymentMethod('SHOPEEPAY'), 'SHOPEEPAY');
});

test('DANA: DOKU page opens on DANA only; the owner QRIS button stays QRIS; DANA goes to DOKU, OVO/ShopeePay to Duitku', async () => {
  const { db, now, customer, order } = await setup();
  const doku = fakeDoku();
  const gw = dokuGateway(cfg, doku.fetchImpl);
  const danaOrder = await setPaymentMethod(db, customer.id, order.orderRowId, 'DANA');
  const danaUrl = await paymentLinkFor(db, gw, danaOrder, customer, links, now);
  assert.deepEqual(doku.created[0].payment.payment_method_types, ['EMONEY_DANA']);
  assert.equal(doku.created[0].payment.payment_due_date, PAYMENT_DUE_MINUTES);
  assert.equal((await paymentLinkFor(db, gw, danaOrder, customer, links, now + 60000)), danaUrl); // reused

  // The owner's QRIS button: a QRIS page, not the open DANA link.
  const { url: qrisUrl } = await ownerQrisLink(db, gw, order.orderRowId, links, now + 60000);
  assert.notEqual(qrisUrl, danaUrl);
  assert.deepEqual(doku.created[1].payment.payment_method_types, ['QRIS']);

  const f = fakeDoku().fetchImpl;
  const both = { DOKU_CLIENT_ID: 'c', DOKU_SECRET_KEY: 's', DUITKU_MERCHANT_CODE: 'D1', DUITKU_API_KEY: 'k', PAYMENT_GATEWAY: 'doku' };
  assert.equal(gatewayForMethod(both, 'DANA', 'a@b.id', f)?.name, 'doku');
  assert.equal(gatewayForMethod(both, 'SHOPEEPAY', 'a@b.id', f)?.name, 'duitku');
  assert.equal(gatewayForMethod({ DUITKU_MERCHANT_CODE: 'D1', DUITKU_API_KEY: 'k', PAYMENT_GATEWAY: 'duitku' }, 'DANA', 'a@b.id', f), null); // no DOKU = no DANA
});

test('Switching OVO → ShopeePay while the OVO link is open makes a new ShopeePay page (links are per e-wallet)', async () => {
  const { db, now, customer, order } = await setup();
  const duitku = fakeDuitku();
  const gw = duitkuGateway(dcfg, duitku.fetchImpl);
  const ovoUrl = await paymentLinkFor(db, gw, await setPaymentMethod(db, customer.id, order.orderRowId, 'OVO'), customer, links, now);
  const spUrl = await paymentLinkFor(db, gw, await setPaymentMethod(db, customer.id, order.orderRowId, 'SHOPEEPAY'), customer, links, now + 30000);
  assert.notEqual(spUrl, ovoUrl);
  assert.equal(duitku.created[1].paymentMethod, 'SA');
  // Back to ShopeePay: its open page again (still valid for ~2 hours).
  assert.equal(await paymentLinkFor(db, gw, await setPaymentMethod(db, customer.id, order.orderRowId, 'SHOPEEPAY'), customer, links, now + 60000), spUrl);
  assert.equal(duitku.created.length, 2);
});

test('Owner orders: one-time admin link, 24 hours to pay, source tags only, WhatsApp pay link', async () => {
  const { db, now, order } = await setup();
  // The admin link works once and only for 5 minutes; the session it opens says who is in admin mode.
  const link = await createOwnerLinkToken(db, 'owner@jentis.id', now);
  assert.equal(await redeemOwnerLinkToken(db, link, now + 6 * 60000), null);
  const link2 = await createOwnerLinkToken(db, 'owner@jentis.id', now);
  const session = await redeemOwnerLinkToken(db, link2, now + 60000);
  assert.ok(session);
  assert.equal(await redeemOwnerLinkToken(db, link2, now + 60000), null);
  assert.equal(await ownerForSession(db, session!, now + 3600000), 'owner@jentis.id');
  assert.equal(await ownerForSession(db, session!, now + 13 * 3600000), null);
  assert.equal(await ownerForSession(db, link2, now + 60000), null); // a link token is not a session

  // Source: only the picked ad tags (never the owner's browser IDs); "W" = none; unknown = refused.
  const attr = ownerAttribution('K', now)!;
  assert.equal(attr.utm_campaign, 'outer-cities-nov26');
  assert.equal(attr.fbp, undefined);
  assert.equal(ownerAttribution('W', now), null);
  assert.throws(() => ownerAttribution('?', now), /Pilih dari mana/);
  assert.equal(ownerAttribution('S', now)!.utm_medium, 'cpc');

  // Placed by the owner: no method yet, not cancelled after the usual 2¼ hours, cancelled after 24 hours.
  await markOwnerOrder(db, order.orderRowId, 'owner@jentis.id', attr);
  const marked = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(marked.paymentMethod, null);
  assert.equal(marked.placedByOwner, 'owner@jentis.id');
  const doku = fakeDoku();
  const gw = dokuGateway(cfg, doku.fetchImpl);
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + EXPIRE_AFTER_MS + 60000)).cancelled, []);
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + TRANSFER_EXPIRE_AFTER_MS + 60000)).cancelled, [order.orderRowId]);

  const wa = payLinkWhatsApp({ orderId: '171120260001', total: 175000, recipientName: 'Rini Ayu', recipientPhone: '081234567890' }, 'https://jentiskitchen.id/orders/x/open?k=y', 'Rp 175.000');
  assert.match(wa, /^https:\/\/wa\.me\/6281234567890\?text=/);
  assert.match(decodeURIComponent(wa), /Kak Rini, .*#171120260001 sebesar Rp 175\.000[\s\S]*open\?k=y/);
});

test('OVO: cancelled a minute after the 3-minute link closed, voucher back; a new try or a paid order is respected', async () => {
  const db = freshDb();
  const now = Date.parse('2026-10-13T07:00:00Z');
  const { customer } = await registerCustomer(db, { name: 'Rini', email: 'rini@example.test', phone: '081234567890', password: 'rahasia123' }, now);
  await markEmailVerified(db, customer.id, now);
  const voucher = (await listCustomerVouchers(db, customer.id, now)).find((v) => v.status === 'AVAILABLE')!;
  const address = { recipientName: 'Rini', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' };
  const { order } = await placeOrder(db, customer, { items: { babiManis: 2 }, voucherCode: voucher.code, address }, null, now);
  const duitku = fakeDuitku();
  const gw = duitkuGateway(dcfg, duitku.fetchImpl);
  const ovoOrder = await setPaymentMethod(db, customer.id, order.orderRowId, 'OVO');

  // Chose OVO but the page could not be opened yet: no OVO deadline running.
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + 10 * 60000)).cancelled, []);

  await paymentLinkFor(db, gw, ovoOrder, customer, links, now);
  // Link open, and within the minute after it closed: untouched.
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + 3.5 * 60000)).cancelled, []);
  // Past that: cancelled, voucher available again, customer told.
  const r = await expireUnpaidOrders(db, [gw], links, null, now + 4 * 60000 + 1000);
  assert.deepEqual(r.cancelled, [order.orderRowId]);
  assert.match(r.emails[0].subject, /kedaluwarsa/);
  assert.equal((await listCustomerVouchers(db, customer.id, now)).find((v) => v.code === voucher.code)!.status, 'AVAILABLE');

  // A second order: trying again later opens a new 3 minutes; approved just before the cut-off counts as paid.
  const { order: o2 } = await placeOrder(db, customer, { items: { babiManis: 1 }, address }, null, now);
  const ovo2 = await setPaymentMethod(db, customer.id, o2.orderRowId, 'OVO');
  await paymentLinkFor(db, gw, ovo2, customer, links, now);
  await paymentLinkFor(db, gw, ovo2, customer, links, now + 4 * 60000);
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + 5 * 60000)).cancelled, []);
  duitku.statuses[`JK${o2.orderId}R2`] = { statusCode: '00', amount: String(o2.total) };
  const late = await expireUnpaidOrders(db, [gw], links, null, now + 8 * 60000 + 1000);
  assert.deepEqual([late.cancelled, late.paid], [[], [o2.orderRowId]]);

  // Switched to manual transfer: the 24 hours apply, not the OVO window.
  const { order: o3 } = await placeOrder(db, customer, { items: { babiManis: 1 }, address }, null, now);
  await paymentLinkFor(db, gw, await setPaymentMethod(db, customer.id, o3.orderRowId, 'OVO'), customer, links, now);
  await setPaymentMethod(db, customer.id, o3.orderRowId, 'TRANSFER');
  assert.deepEqual((await expireUnpaidOrders(db, [gw], links, null, now + 30 * 60000)).cancelled, []);
});
