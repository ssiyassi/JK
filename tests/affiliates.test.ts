// Public affiliate programme (jentiskitchen.id/affiliate, Website → Affiliates). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { jakartaInstant } from '../src/lib/core/time.ts';
import { placeOrder } from '../src/lib/shop/orders.ts';
import { affiliateLinksEmail } from '../src/lib/shop/email.ts';
import {
  activeAffiliateCode,
  affiliateCommissionMessage,
  affiliateCommissions,
  affiliateLandingPath,
  affiliateLink,
  affiliateSignupMessage,
  createAffiliate,
  getAffiliateByEmail,
  getAffiliateBySlug,
  listAffiliates,
  maskAccount,
  setAffiliateDisabled,
} from '../src/lib/shop/affiliates.ts';

const MIGRATIONS = ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql',
  '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql',
  '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0014_rate_limits.sql', '0015_stock_product_short_name.sql',
  '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0026_order_attribution.sql', '0028_guest_checkout.sql',
  '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0034_collabs.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql',
  '0046_affiliates.sql'];

function shopDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-affiliates-')), 'test.db'));
  for (const f of MIGRATIONS) db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 50, 50, 50, 50, 0);`);
  return db;
}

// Thursday 12 Nov 2026, 10:00 WIB: this week = Mon 9 – Sun 15 Nov, last week = 2 – 8 Nov.
const NOW = jakartaInstant(2026, 10, 12, 10).getTime();
const DAY = 86_400_000;
const ADDRESS = { recipientName: 'Rini', street: 'Jl. Mawar 1', kelurahan: 'Gambir', kecamatan: 'Gambir', city: 'Jakarta Pusat' };
const via = (code: string) => JSON.stringify({ utm_source: 'affiliate', utm_medium: 'affiliate', utm_campaign: code });

const signup = (over: Record<string, unknown> = {}) => ({
  name: 'Sari Dewi',
  city: 'Jakarta Barat',
  whatsapp: '0812 3456 7890',
  email: ' Sari@Example.com ',
  channels: ['whatsapp', 'word_of_mouth', 'nonsense'],
  bank: 'BCA',
  accountName: 'Sari Dewi',
  accountNumber: '123-456-7890',
  ...over,
});

async function paidOrder(db: ReturnType<typeof shopDb>, opts: { phone: string; at: number; items?: Record<string, number>; attribution?: string; paid?: boolean }) {
  const { order } = await placeOrder(db, { guest: true as const, email: null, phone: null }, { items: opts.items ?? { babiManis: 1 }, address: { ...ADDRESS, recipientPhone: opts.phone }, voucherCode: null }, null, opts.at);
  if (opts.attribution) db.raw.prepare('UPDATE shop_orders SET attribution = ? WHERE orderRowId = ?').run(opts.attribution, order.orderRowId);
  if (opts.paid !== false) {
    db.raw.prepare(`UPDATE orders SET paymentStatus = 'PAID' WHERE id = ?`).run(order.orderRowId);
    db.raw.prepare('UPDATE shop_orders SET stockTakenAt = ? WHERE orderRowId = ?').run(opts.at + 60_000, order.orderRowId);
  }
  return order;
}

test('sign-up: validates, keeps known channels, makes a short link and a private page; one per WhatsApp', async () => {
  const db = shopDb();
  const a = await createAffiliate(db, signup(), NOW);
  assert.equal(a.whatsapp, '6281234567890');
  assert.deepEqual(a.channels, ['whatsapp', 'word_of_mouth']);
  assert.equal(a.accountNumber, '1234567890');
  assert.equal(a.commissionPerBox, 10000);
  assert.match(a.code, /^sari[a-z0-9]{3}$/);
  assert.match(a.slug, /^sari-dewi-[a-z0-9]{8}$/);
  assert.equal(affiliateLink(a), `https://jentiskitchen.id/r/${a.code}`);
  assert.equal(affiliateLandingPath(a.code), `/?utm_source=affiliate&utm_medium=affiliate&utm_campaign=${a.code}`);
  assert.equal((await getAffiliateBySlug(db, a.slug))!.id, a.id);
  assert.equal(await activeAffiliateCode(db, a.code.toUpperCase()), a.code);
  assert.equal(maskAccount(a.accountNumber), '••••7890');

  assert.equal(a.email, 'sari@example.com');
  assert.equal((await getAffiliateByEmail(db, 'SARI@example.com '))!.id, a.id);
  assert.equal(await getAffiliateByEmail(db, 'nobody@example.com'), null);
  await assert.rejects(createAffiliate(db, signup({ name: 'Other', email: 'other@example.com' }), NOW), /Nomor WhatsApp ini sudah terdaftar/);
  await assert.rejects(createAffiliate(db, signup({ name: 'Other', whatsapp: '081299990000' }), NOW), /Email ini sudah terdaftar/);
  await assert.rejects(createAffiliate(db, signup({ whatsapp: '081299990000', email: 'x' }), NOW), /email tidak valid/);
  await assert.rejects(createAffiliate(db, signup({ whatsapp: '081299990000', email: 'o@example.com', channels: [] }), NOW), /minimal satu/);
  await assert.rejects(createAffiliate(db, signup({ whatsapp: '081299990000', email: 'o@example.com', city: '' }), NOW), /Kota wajib/);
  await assert.rejects(createAffiliate(db, signup({ whatsapp: '081299990000', email: 'o@example.com', accountNumber: 'abc' }), NOW), /hanya boleh berisi angka/);

  await setAffiliateDisabled(db, a.id, true, NOW);
  assert.equal(await activeAffiliateCode(db, a.code), null);
  assert.match(affiliateSignupMessage(a, 'https://admin.x'), /New affiliate: Sari Dewi \(Jakarta Barat\)\nWhatsApp: 081234567890 · sari@example\.com\nPromotes via: WhatsApp, Word of mouth/);

  const welcome = affiliateLinksEmail(a, { shopUrl: 'https://jentiskitchen.id', adminUrl: 'https://admin.x' }, 'welcome');
  assert.equal(welcome.to, 'sari@example.com');
  assert.match(welcome.html, new RegExp(`https://jentiskitchen.id/r/${a.code}`));
  assert.match(welcome.html, new RegExp(`https://jentiskitchen.id/affiliate/${a.slug}`));
  assert.match(welcome.html, /Rp\s?10\.000 untuk setiap box/);
  assert.equal(affiliateLinksEmail(a, { shopUrl: 'https://jentiskitchen.id', adminUrl: '' }, 'reminder').subject, 'Link & komisi affiliate kamu');
});

test('commission: new customer through the link belongs to the affiliate forever; old customers and own orders do not count', async () => {
  const db = shopDb();
  db.raw.exec(`UPDATE shop_products SET boxValue = 2 WHERE product = 'sapiManis'`);
  // A customer who bought before the programme started.
  await paidOrder(db, { phone: '081100000009', at: NOW - DAY * 40 });
  const started = NOW - DAY * 30;
  const sari = await createAffiliate(db, signup(), started);
  const budi = await createAffiliate(db, signup({ name: 'Budi', whatsapp: '081277778888', email: 'budi@example.com' }), started);

  const lastWeek = jakartaInstant(2026, 10, 4, 10).getTime(); // Wed 4 Nov
  const thisWeek = jakartaInstant(2026, 10, 10, 10).getTime(); // Tue 10 Nov
  // Ani: first order through Sari's link (1 babi + 1 sapi = 3 boxes), then repeat orders WITHOUT the link.
  await paidOrder(db, { phone: '081100000001', at: lastWeek, items: { babiManis: 1, sapiManis: 1 }, attribution: via(sari.code) });
  await paidOrder(db, { phone: '081100000001', at: thisWeek, items: { babiManis: 2 } });
  // Later Ani taps Budi's link: still Sari's customer.
  await paidOrder(db, { phone: '081100000001', at: thisWeek + 1000, attribution: via(budi.code) });
  // Unpaid order: not counted.
  await paidOrder(db, { phone: '081100000001', at: thisWeek + 2000, paid: false });
  // Old customer through Sari's link: not new, not counted.
  await paidOrder(db, { phone: '081100000009', at: thisWeek, attribution: via(sari.code) });
  // Sari's own order through her link: not counted.
  await paidOrder(db, { phone: '081234567890', at: thisWeek, attribution: via(sari.code) });
  // Eko: Budi's new customer.
  await paidOrder(db, { phone: '081100000002', at: thisWeek, attribution: via(budi.code.toUpperCase()) });

  const report = await affiliateCommissions(db, await listAffiliates(db), NOW);
  assert.equal(report.thisWeek.startKey, '2026-11-09');
  const s = report.affiliates.find((r) => r.affiliateId === sari.id)!;
  assert.equal(s.customers, 1);
  assert.deepEqual(s.lastWeek, { orders: 1, boxes: 3, commission: 30000 });
  assert.deepEqual(s.thisWeek, { orders: 2, boxes: 3, commission: 30000 });
  assert.deepEqual(s.total, { orders: 3, boxes: 6, commission: 60000 });
  assert.deepEqual(s.orders.map((o) => o.kind), ['REPEAT', 'REPEAT', 'FIRST']);
  const b = report.affiliates.find((r) => r.affiliateId === budi.id)!;
  assert.equal(b.customers, 1);
  assert.deepEqual(b.thisWeek, { orders: 1, boxes: 1, commission: 10000 });

  const text = affiliateCommissionMessage(report, await listAffiliates(db), 'https://admin.jentiskitchen.id')!;
  assert.match(text, /This week 9 Nov – 15 Nov/);
  assert.match(text, /1\. Sari Dewi \(Jakarta Barat\)\n {3}This week: 3 boxes x Rp 10\.000 = Rp 30\.000\n {3}Last week: 3 boxes = Rp 30\.000\n {3}Transfer to: BCA 1234567890 a\/n Sari Dewi/);
  assert.match(text, /Total this week so far: Rp 40\.000/);

  // Switched off: orders paid after that no longer earn; earlier ones stay.
  await setAffiliateDisabled(db, sari.id, true, lastWeek + DAY);
  const off = (await affiliateCommissions(db, await listAffiliates(db), NOW)).affiliates.find((r) => r.affiliateId === sari.id)!;
  assert.deepEqual(off.total, { orders: 1, boxes: 3, commission: 30000 });
});

test('commission: nothing to report gives no Telegram message', async () => {
  const db = shopDb();
  await createAffiliate(db, signup(), NOW - DAY);
  const report = await affiliateCommissions(db, await listAffiliates(db), NOW);
  assert.equal(affiliateCommissionMessage(report, await listAffiliates(db), 'x'), null);
  assert.deepEqual((await affiliateCommissions(db, [], NOW)).affiliates, []);
});
