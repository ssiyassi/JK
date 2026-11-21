// Duitku sandbox lane for test accounts (e.g. Duitku's verification team). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { registerCustomer } from '../src/lib/shop/customers.ts';
import { placeOrder, getShopOrder, listWebsiteOrders } from '../src/lib/shop/orders.ts';
import { listOrders } from '../src/lib/core/orders.ts';
import { getInventory } from '../src/lib/core/inventory.ts';
import { onOrderPaid } from '../src/lib/shop/events.ts';
import { gatewayForCustomer, isSandboxTestEmail, paymentGatewaysFromEnv } from '../src/lib/shop/config.ts';
import { duitkuGateway } from '../src/lib/shop/duitku.ts';
import type { FetchLike } from '../src/lib/shop/gateway.ts';
import { applyGatewayResult, paymentLinkFor } from '../src/lib/shop/payments.ts';

const links = { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.jentiskitchen.id' };
const noFetch: FetchLike = async () => ({ ok: true, status: 200, text: async () => '' });
const live = { DOKU_CLIENT_ID: 'c', DOKU_SECRET_KEY: 's', PAYMENT_GATEWAY: 'doku' };
const sandbox = { DUITKU_SANDBOX_MERCHANT_CODE: 'DS1', DUITKU_SANDBOX_API_KEY: 'k', SANDBOX_TEST_EMAILS: ' Tester@Example.test , other@example.test' };

test('sandbox lane: only listed emails get the Duitku sandbox, everyone else the live gateway', () => {
  const env = { ...live, ...sandbox };
  assert.deepEqual(paymentGatewaysFromEnv(env, noFetch).map((g) => g.name), ['doku', 'duitku-sandbox']);
  assert.equal(gatewayForCustomer(env, 'tester@example.test', noFetch)?.name, 'duitku-sandbox');
  assert.equal(gatewayForCustomer(env, 'rini@example.test', noFetch)?.name, 'doku');
  assert.equal(gatewayForCustomer(env, null, noFetch)?.name, 'doku');
  // Without the sandbox key the list does nothing.
  assert.equal(isSandboxTestEmail({ ...live, SANDBOX_TEST_EMAILS: 'tester@example.test' }, 'tester@example.test'), false);
  // Sandbox alone never becomes the gateway for real customers.
  assert.equal(gatewayForCustomer(sandbox, 'rini@example.test', noFetch), null);
});

test('sandbox lane: a sandbox result can only pay invoices opened with the sandbox', async () => {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-sandbox-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql', '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 10, 10, 10, 10, 0);`);
  const now = Date.parse('2026-10-20T07:00:00Z');
  const { customer } = await registerCustomer(db, { name: 'Tester', email: 'tester@example.test', phone: '081234567890', password: 'rahasia123' }, now);
  const { order } = await placeOrder(db, customer, {
    items: { babiManis: 1 },
    address: { recipientName: 'Tester', recipientPhone: '081234567890', street: 'Jl. A', kelurahan: 'K', kecamatan: 'K', city: 'Jakarta' },
  }, null, now);

  const fakeFetch: FetchLike = async (url) => {
    assert.match(url, /sandbox\.duitku\.com/);
    return { ok: true, status: 200, text: async () => JSON.stringify({ statusCode: '00', paymentUrl: 'https://sandbox.duitku.com/pay/1' }) };
  };
  const gw = duitkuGateway({ merchantCode: 'DS1', apiKey: 'k', production: false, sandboxLane: true }, fakeFetch);
  assert.equal(await paymentLinkFor(db, gw, order, customer, links, now), 'https://sandbox.duitku.com/pay/1');
  const inv = `JK${order.orderId}`;

  assert.equal((await applyGatewayResult(db, inv, 'SUCCESS', order.total, now, 'duitku')).kind, 'ignored');
  assert.equal((await getShopOrder(db, order.orderRowId))!.paymentStatus, 'PENDING');
  const stockBefore = JSON.stringify(await getInventory(db));
  assert.equal((await applyGatewayResult(db, inv, 'SUCCESS', order.total, now, 'duitku-sandbox')).kind, 'paid');

  // Paid for the customer, but invisible to the owner: no stock taken, not in any admin list, no owner alerts.
  const paid = (await getShopOrder(db, order.orderRowId))!;
  assert.equal(paid.paymentStatus, 'PAID');
  assert.equal(paid.paidAt, now);
  assert.equal(JSON.stringify(await getInventory(db)), stockBefore);
  assert.equal((await listOrders(db)).some((o) => o.id === order.orderRowId), false);
  assert.equal((await listWebsiteOrders(db)).some((o) => o.orderRowId === order.orderRowId), false);
  const alerts: string[] = [];
  const emails = await onOrderPaid(db, order.orderRowId, 'owner@example.test', links, now, async (text) => { alerts.push(text); });
  assert.deepEqual(emails.map((e) => e.to), ['tester@example.test']);
  assert.deepEqual(alerts, []);
});
