// Unfinished checkouts (src/lib/shop/checkoutLeads.ts). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { checkoutLeadsAlert, LEAD_WAIT_MS, listCheckoutLeads, pruneCheckoutLeads, removeCheckoutLeads, saveCheckoutLead, setCheckoutLeadContacted } from '../src/lib/shop/checkoutLeads.ts';
import type { CatalogItem } from '../src/lib/shop/catalog.ts';

const NOON = Date.parse('2026-11-05T05:00:00Z'); // 12:00 WIB
const NIGHT = Date.parse('2026-11-05T17:00:00Z'); // 00:00 WIB
const catalog = [{ product: 'babiManis', name: 'Babi Marinade Manis', price: 160000, size: '500 gram', visible: true, stockColumn: null }] as unknown as CatalogItem[];
const lead = (over: Record<string, unknown> = {}) => ({ id: 'abcdefghijkl1', name: 'Ani', phone: '0812 3456 7890', items: { babiManis: 2 }, ...over });

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-leads-')), 'test.db'));
  db.raw.exec(readFileSync(new URL('../migrations/0042_checkout_leads.sql', import.meta.url), 'utf8'));
  db.raw.exec('CREATE TABLE shop_orders (orderRowId TEXT, recipientPhone TEXT, createdAt INTEGER)');
  return db;
}

test('a lead appears only after the 30-minute wait, with the product list', async () => {
  const db = freshDb();
  assert.equal(await saveCheckoutLead(db, lead(), catalog, 'Meta ad', NOON), true);
  assert.equal((await listCheckoutLeads(db, NOON)).length, 0);
  const [row] = await listCheckoutLeads(db, NOON + LEAD_WAIT_MS);
  assert.equal(row.phone, '6281234567890');
  assert.equal(row.items, '2 x Babi Marinade Manis');
  assert.equal(row.subtotal, 320000);
});

test('still typing: the same checkout visit overwrites its row', async () => {
  const db = freshDb();
  await saveCheckoutLead(db, lead({ phone: '0812345678' }), catalog, 'Direct', NOON);
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NOON + 5000);
  const rows = await listCheckoutLeads(db, NOON + LEAD_WAIT_MS + 5000);
  assert.deepEqual(rows.map((r) => r.phone), ['6281234567890']);
});

test('malformed input is ignored', async () => {
  const db = freshDb();
  assert.equal(await saveCheckoutLead(db, lead({ phone: '12345' }), catalog, 'Direct', NOON), false);
  assert.equal(await saveCheckoutLead(db, lead({ id: 'bad id' }), catalog, 'Direct', NOON), false);
  assert.equal(await saveCheckoutLead(db, lead({ items: {} }), catalog, 'Direct', NOON), false);
});

test('ordering removes the lead; an order that the delete missed still hides it', async () => {
  const db = freshDb();
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NOON);
  await removeCheckoutLeads(db, '6281234567890');
  assert.equal((await listCheckoutLeads(db, NOON + LEAD_WAIT_MS)).length, 0);
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NOON);
  db.raw.exec(`INSERT INTO shop_orders VALUES ('o', '6281234567890', ${NOON + 1000})`);
  assert.equal((await listCheckoutLeads(db, NOON + LEAD_WAIT_MS)).length, 0);
});

test('contacted stays with the phone number across checkout visits', async () => {
  const db = freshDb();
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NOON);
  await setCheckoutLeadContacted(db, '081234567890', true, NOON);
  await saveCheckoutLead(db, lead({ id: 'abcdefghijkl2' }), catalog, 'Direct', NOON + 1000);
  const rows = await listCheckoutLeads(db, NOON + 1000 + LEAD_WAIT_MS);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].contactedAt);
});

test('Telegram: once, no name or number, and never at night', async () => {
  const db = freshDb();
  const sent: string[] = [];
  const send = async (t: string) => sent.push(t);
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NIGHT - LEAD_WAIT_MS);
  assert.equal(await checkoutLeadsAlert(db, 'https://a', NIGHT, send), 0);
  const morning = NIGHT + 8 * 3600000;
  assert.equal(await checkoutLeadsAlert(db, 'https://a', morning, send), 1);
  assert.equal(await checkoutLeadsAlert(db, 'https://a', morning + 60000, send), 0);
  assert.equal(sent.length, 1);
  assert.ok(!/Ani|0812|62812/.test(sent[0]));
});

test('leads are deleted after 14 days', async () => {
  const db = freshDb();
  await saveCheckoutLead(db, lead(), catalog, 'Direct', NOON);
  await pruneCheckoutLeads(db, NOON + 15 * 86400000);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM checkout_leads').get()!.n, 0);
});
