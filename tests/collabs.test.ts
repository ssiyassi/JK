// Influencer collab pages (Website → Collabs). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { jakartaInstant } from '../src/lib/core/time.ts';
import { getCustomer, registerCustomer } from '../src/lib/shop/customers.ts';
import { markEmailVerified } from '../src/lib/shop/email-verify.ts';
import { placeOrder } from '../src/lib/shop/orders.ts';
import { createCampaign } from '../src/lib/shop/campaigns.ts';
import { collabCommissionMessage, collabCommissions } from '../src/lib/shop/collab-report.ts';
import {
  acceptCollab,
  collabAcceptedMessage,
  collabClosed,
  collabPageLink,
  collabShopLink,
  COLLAB_DEFAULTS,
  createApplication,
  createCollab,
  deleteCollab,
  getCollabBySlug,
  hideApplication,
  listApplications,
  listCollabs,
  publicCollab,
  setCollabDisabled,
  slugify,
  updateCollab,
} from '../src/lib/shop/collabs.ts';

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-collabs-')), 'test.db'));
  db.raw.exec(readFileSync(new URL('../migrations/0034_collabs.sql', import.meta.url), 'utf8'));
  return db;
}

// 25 Oct 2026, 10:00 WIB.
const NOW = jakartaInstant(2026, 9, 25, 10).getTime();
const DAY = 86_400_000;

const terms = (over: Record<string, unknown> = {}) => ({
  name: 'Sarah Wijaya',
  platform: 'instagram',
  handle: '@sarahmasak',
  campaign: '',
  voucherCode: 'sarah',
  freeProducts: COLLAB_DEFAULTS.freeProducts,
  commissionPerBox: 10000,
  codePercent: 20,
  codeCap: 100000,
  contentDays: 14,
  minReels: 1,
  minStories: 2,
  startDate: '2026-10-25',
  endDate: '2027-01-24',
  ...over,
});

const acceptance = (over: Record<string, unknown> = {}) => ({
  agree: true,
  name: 'Sarah Wijaya',
  whatsapp: '0812-3456-7890',
  address: 'Jl. Mawar 1, Jakarta',
  bank: 'BCA',
  accountNumber: '1234567890',
  accountName: 'Sarah Wijaya',
  ...over,
});

test('slugify keeps letters, digits and dashes', () => {
  assert.equal(slugify('Sarah Wijaya'), 'sarah-wijaya');
  assert.equal(slugify('  Dédé & Co!! '), 'dede-co');
});

test('creating a page: link name from the name, code upper-cased, random page ending, no voucher', async () => {
  const db = freshDb();
  const c = await createCollab(db, terms(), NOW);
  assert.equal(c.campaign, 'sarah-wijaya');
  assert.equal(c.voucherCode, 'SARAH');
  assert.equal(c.handle, 'sarahmasak');
  assert.match(c.slug, /^sarah-wijaya-[a-z2-9]{4}$/);
  assert.equal(c.acceptedAt, null);
  assert.equal(collabShopLink(c), 'https://jentiskitchen.id/?utm_source=instagram&utm_medium=influencer&utm_campaign=sarah-wijaya');
  assert.equal(collabPageLink(c), `https://jentiskitchen.id/collab/${c.slug}`);
  // Nothing is written to the voucher tables (they are not even in this database).
  assert.equal((await listCollabs(db)).length, 1);
});

test('link name and voucher code must be unique; bad input is refused', async () => {
  const db = freshDb();
  await createCollab(db, terms({ campaign: 'sarah' }), NOW);
  await assert.rejects(createCollab(db, terms({ name: 'Sarah B', campaign: 'sarah', voucherCode: 'SARAHB' }), NOW), /link name “sarah” is already used/);
  await assert.rejects(createCollab(db, terms({ name: 'Other', campaign: 'other' }), NOW), /voucher code SARAH is already used/);
  await assert.rejects(createCollab(db, terms({ campaign: 'x2', voucherCode: 'A B' }), NOW), /voucher code must be/);
  await assert.rejects(createCollab(db, terms({ campaign: 'x3', voucherCode: 'XTHREE', endDate: '2026-10-01' }), NOW), /end on or after/);
  await assert.rejects(createCollab(db, terms({ campaign: 'x4', voucherCode: 'XFOUR', platform: 'youtube' }), NOW), /Instagram or TikTok/);
});

test('editing keeps the page address; the public view hides bank details and the note', async () => {
  const db = freshDb();
  const c = await createCollab(db, terms({ note: 'secret note' }), NOW);
  const changed = await updateCollab(db, c.id, terms({ commissionPerBox: 12000, note: 'secret note' }), NOW + 1000);
  assert.equal(changed.slug, c.slug);
  assert.equal(changed.commissionPerBox, 12000);
  await acceptCollab(db, c.slug, acceptance(), NOW + 2000);
  const view = publicCollab((await getCollabBySlug(db, c.slug))!);
  assert.equal('accepted' in view, false);
  assert.equal('note' in view, false);
  assert.equal(JSON.stringify(view).includes('1234567890'), false);
});

test('accepting: needs the tick and valid details, only once, not when closed', async () => {
  const db = freshDb();
  const c = await createCollab(db, terms(), NOW);
  await assert.rejects(acceptCollab(db, c.slug, acceptance({ agree: false }), NOW), /Centang persetujuan/);
  await assert.rejects(acceptCollab(db, c.slug, acceptance({ whatsapp: '123' }), NOW), /Nomor HP tidak valid/);
  await assert.rejects(acceptCollab(db, c.slug, acceptance({ accountNumber: 'abc12' }), NOW), /hanya boleh berisi angka/);
  const done = await acceptCollab(db, c.slug, acceptance({ message: 'Siap!' }), NOW);
  assert.equal(done.acceptedAt, NOW);
  assert.equal(done.accepted?.whatsapp, '6281234567890');
  assert.equal(done.accepted?.message, 'Siap!');
  await assert.rejects(acceptCollab(db, c.slug, acceptance(), NOW), /sudah kamu setujui/);
  assert.match(collabAcceptedMessage(done, 'https://admin.jentiskitchen.id'), /create voucher SARAH \(20%, max Rp 100\.000\)/);
  // Accepted pages cannot be deleted, only switched off.
  await assert.rejects(deleteCollab(db, c.id), /cannot be deleted/);

  const other = await createCollab(db, terms({ name: 'Budi', campaign: 'budi', voucherCode: 'BUDI' }), NOW);
  await setCollabDisabled(db, other.id, true, NOW);
  await assert.rejects(acceptCollab(db, other.slug, acceptance(), NOW), /tidak berlaku/);
  await setCollabDisabled(db, other.id, false, NOW);
  await assert.rejects(acceptCollab(db, other.slug, acceptance(), NOW + 100 * DAY), /tidak berlaku/);
  await assert.rejects(acceptCollab(db, 'no-such-page', acceptance(), NOW), /tidak ditemukan/);
});

test('the contract closes the day after its end date (WIB)', () => {
  const c = { disabledAt: null, endDate: '2026-10-25' };
  assert.equal(collabClosed(c, NOW), false);
  assert.equal(collabClosed(c, jakartaInstant(2026, 9, 25, 23, 59).getTime()), false);
  assert.equal(collabClosed(c, jakartaInstant(2026, 9, 26, 0, 1).getTime()), true);
});

test('sign-ups: handle cleaned from @ or a profile link; making a page marks the sign-up; hide removes it', async () => {
  const db = freshDb();
  const a = await createApplication(db, { name: 'Rina', platform: 'tiktok', handle: 'https://www.tiktok.com/@rina.cooks?lang=id', followers: '12rb', whatsapp: '081298765432' }, NOW);
  assert.equal(a.handle, 'rina.cooks');
  const b = await createApplication(db, { name: 'Dewi', platform: 'instagram', handle: '@dewi_eats', followers: '5000', whatsapp: '081211112222', city: 'Bekasi' }, NOW + 1);
  assert.equal(b.handle, 'dewi_eats');
  await assert.rejects(createApplication(db, { name: 'X', platform: 'instagram', handle: 'bad handle!', followers: '1', whatsapp: '081211112222' }, NOW), /Username tidak valid/);

  const c = await createCollab(db, terms({ name: 'Rina', campaign: 'rina', voucherCode: 'RINA', platform: 'tiktok', applicationId: a.id }), NOW);
  let list = await listApplications(db);
  assert.equal(list.find((x) => x.id === a.id)?.collabId, c.id);
  await hideApplication(db, b.id, NOW);
  list = await listApplications(db);
  assert.deepEqual(list.map((x) => x.id), [a.id]);
  // Deleting the page frees the sign-up again.
  await deleteCollab(db, c.id);
  assert.equal((await listApplications(db))[0].collabId, null);
});

// ---------------------------------------------------------------------------
// Weekly commission report
// ---------------------------------------------------------------------------

const ORDER_MIGRATIONS = ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0004_shop_payments.sql', '0005_shop_content.sql',
  '0006_website_only_products.sql', '0007_banner_mobile_image.sql', '0008_shipping_and_cancel_reason.sql', '0010_website_stock_on_payment.sql',
  '0011_delivered_at.sql', '0012_payment_gateway.sql', '0013_customer_disabled.sql', '0025_email_verification.sql', '0014_rate_limits.sql', '0015_stock_product_short_name.sql',
  '0016_product_box_value.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0026_order_attribution.sql', '0028_guest_checkout.sql',
  '0029_checkout_accounts_confirmed.sql', '0030_new_customer_discount.sql', '0032_days_off.sql', '0033_payment_method.sql', '0051_payment_channel.sql', '0052_owner_orders.sql', '0034_collabs.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql'];

function shopDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-collab-report-')), 'test.db'));
  for (const f of ORDER_MIGRATIONS) db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  db.raw.exec(`INSERT INTO current_inventory VALUES ('current', 50, 50, 50, 50, 0);`);
  return db;
}

// Sunday 25 Oct 2026 is the last day of the week Mon 19 – Sun 25 Oct; last week is 12 – 18 Oct.
const ADDRESS = { recipientName: 'Rini', street: 'Jl. Mawar 1', kelurahan: 'Gambir', kecamatan: 'Gambir', city: 'Jakarta Pusat' };
const link = (campaign: string, medium = 'influencer') => JSON.stringify({ utm_source: 'instagram', utm_medium: medium, utm_campaign: campaign });

async function paidOrder(
  db: ReturnType<typeof shopDb>,
  opts: { phone: string; at: number; items?: Record<string, number>; attribution?: string; code?: string; paid?: boolean; buyer?: Parameters<typeof placeOrder>[1] },
) {
  const buyer = opts.buyer ?? { guest: true as const, email: null, phone: null };
  const { order } = await placeOrder(db, buyer, { items: opts.items ?? { babiManis: 1 }, address: { ...ADDRESS, recipientPhone: opts.phone }, voucherCode: opts.code ?? null }, null, opts.at);
  if (opts.attribution) db.raw.prepare('UPDATE shop_orders SET attribution = ? WHERE orderRowId = ?').run(opts.attribution, order.orderRowId);
  if (opts.paid !== false) {
    db.raw.prepare(`UPDATE orders SET paymentStatus = 'PAID' WHERE id = ?`).run(order.orderRowId);
    db.raw.prepare('UPDATE shop_orders SET stockTakenAt = ? WHERE orderRowId = ?').run(opts.at + 60_000, order.orderRowId);
  }
  return order;
}

test('commission: first order by link, every order by code, boxes x box value, weeks Mon–Sun WIB', async () => {
  const db = shopDb();
  db.raw.exec(`UPDATE shop_products SET boxValue = 2 WHERE product = 'sapiManis'`);
  const started = jakartaInstant(2026, 9, 10, 9).getTime();
  const sarah = await createCollab(db, terms({ campaign: 'sarah', voucherCode: 'SARAH' }), started);
  const budi = await createCollab(db, terms({ name: 'Budi', campaign: 'budi', voucherCode: 'BUDI' }), started);
  await createCampaign(db, { name: 'Sarah', type: 'GENERAL', code: 'sarah', discountType: 'PERCENT', discountValue: '20', capAmount: '100000', minOrder: '0',
    startDate: '2026-10-10', endDate: '2027-01-31', quota: '', perCustomerLimit: '', perCustomerDailyLimit: '' }, started);

  const lastWeek = jakartaInstant(2026, 9, 14, 10).getTime(); // Wed 14 Oct
  const thisWeek = jakartaInstant(2026, 9, 20, 10).getTime(); // Tue 20 Oct
  // Last week: Ani's first order through Sarah's link: 1 babi + 2 sapi (2 boxes each) = 5 boxes.
  const ani1 = await paidOrder(db, { phone: '081100000001', at: lastWeek, items: { babiManis: 1, sapiManis: 2 }, attribution: link('sarah') });
  // This week: Ani again through the link, no code: not her first order, does not count.
  await paidOrder(db, { phone: '081100000001', at: thisWeek, attribution: link('Sarah') });
  // This week: Ani with Sarah's code (and the link cookie): counts once, as CODE. 3 boxes.
  const ani3 = await paidOrder(db, { phone: '081100000001', at: thisWeek + 1000, items: { babiManis: 3 }, attribution: link('sarah'), code: 'SARAH' });
  // Dodi: first order with the link but unpaid, cancelled, or a different medium: none count.
  await paidOrder(db, { phone: '081100000002', at: thisWeek, attribution: link('sarah'), paid: false });
  const cancelled = await paidOrder(db, { phone: '081100000003', at: thisWeek, attribution: link('sarah') });
  db.raw.prepare(`UPDATE orders SET orderStatus = 'CANCELLED' WHERE id = ?`).run(cancelled.orderRowId);
  await paidOrder(db, { phone: '081100000004', at: thisWeek, attribution: link('sarah', 'paid_social') });
  // A sandbox test order does not count.
  const sandbox = await paidOrder(db, { phone: '081100000005', at: thisWeek, attribution: link('sarah') });
  db.raw.prepare(`INSERT INTO shop_payments (invoiceNumber, orderRowId, amount, paymentUrl, expiresAt, status, createdAt, gateway) VALUES ('t1', ?, 1, 'x', 0, 'SUCCESS', 0, 'duitku-sandbox')`).run(sandbox.orderRowId);
  // Eko's first order through Budi's link: 2 boxes.
  const eko = await paidOrder(db, { phone: '081100000006', at: thisWeek + 2000, items: { babiAsin: 2 }, attribution: link('budi') });
  // Two weeks ago (before last week): counts only in the total.
  const old = await paidOrder(db, { phone: '081100000007', at: jakartaInstant(2026, 9, 11, 10).getTime(), attribution: link('sarah') });

  const report = await collabCommissions(db, await listCollabs(db), NOW);
  assert.equal(report.thisWeek.startKey, '2026-10-19');
  assert.equal(report.thisWeek.endKey, '2026-10-25');
  assert.equal(report.lastWeek.startKey, '2026-10-12');
  const s = report.collabs.find((c) => c.collabId === sarah.id)!;
  assert.equal(s.voucherCreated, true);
  assert.deepEqual(s.thisWeek, { orders: 1, boxes: 3, commission: 30000 });
  assert.deepEqual(s.lastWeek, { orders: 1, boxes: 5, commission: 50000 });
  assert.deepEqual(s.total, { orders: 3, boxes: 9, commission: 90000 });
  assert.deepEqual(s.orders.map((o) => [o.orderRowId, o.via]), [[ani3.orderRowId, 'CODE'], [ani1.orderRowId, 'LINK'], [old.orderRowId, 'LINK']]);

  const b = report.collabs.find((c) => c.collabId === budi.id)!;
  assert.equal(b.voucherCreated, false);
  assert.deepEqual(b.thisWeek, { orders: 1, boxes: 2, commission: 20000 });
  assert.equal(b.orders[0].orderRowId, eko.orderRowId);

  // Commission per box follows the collab's terms.
  await updateCollab(db, budi.id, terms({ name: 'Budi', campaign: 'budi', voucherCode: 'BUDI', commissionPerBox: 12500 }), NOW);
  const again = await collabCommissions(db, await listCollabs(db), NOW);
  assert.equal(again.collabs.find((c) => c.collabId === budi.id)!.thisWeek.commission, 25000);

  const text = collabCommissionMessage(report, await listCollabs(db), 'https://admin.jentiskitchen.id')!;
  assert.match(text, /This week 19 Oct – 25 Oct/);
  assert.match(text, /1\. Sarah Wijaya \(@sarahmasak\)\n {3}This week: 3 boxes x Rp 10\.000 = Rp 30\.000\n {3}Last week: 5 boxes = Rp 50\.000/);
  assert.match(text, /Total this week so far: Rp 50\.000/);
});

test('commission: an account\'s first order is by account, phone or email; orders before the page was made do not count', async () => {
  const db = shopDb();
  const started = jakartaInstant(2026, 9, 19, 9).getTime();
  const { customer } = await registerCustomer(db, { name: 'ani', email: 'ani@example.com', phone: '081100000011', password: 'rahasia123' }, started - DAY * 30);
  await markEmailVerified(db, customer.id, started);
  const ani = (await getCustomer(db, customer.id))!;
  // Paid before the collab page existed, to another phone number: still makes the later link order a repeat order.
  await paidOrder(db, { phone: '081100000099', at: started - DAY, buyer: ani, attribution: link('sarah') });
  await createCollab(db, terms({ campaign: 'sarah', voucherCode: 'SARAH' }), started);
  await paidOrder(db, { phone: '081100000098', at: started + DAY, buyer: ani, attribution: link('sarah') });
  const [r] = (await collabCommissions(db, await listCollabs(db), NOW)).collabs;
  assert.deepEqual(r.total, { orders: 0, boxes: 0, commission: 0 });
  assert.equal(collabCommissionMessage(await collabCommissions(db, await listCollabs(db), NOW), await listCollabs(db), 'x'), null);
});
