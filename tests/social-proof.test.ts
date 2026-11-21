// Real-orders snack bar (src/lib/shop/socialProof.ts). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { createOrder } from '../src/lib/core/orders.ts';
import { areaOf, loadSocialProof, maskedName } from '../src/lib/shop/socialProof.ts';
import { timeAgo } from '../src/lib/shop/social-proof-text.ts';

test('only a city from the fixed list leaves the address', () => {
  assert.equal(areaOf('Jl. Kebon Jeruk 12 RT 3, Jakarta Barat 11530'), 'Jakarta Barat');
  assert.equal(areaOf('Perum Alam Sutera, Tangerang Selatan'), 'Tangerang Selatan');
  assert.equal(areaOf('Cluster X, Tangerang'), 'Tangerang');
  assert.equal(areaOf('apartemen jaksel tower b'), 'Jakarta Selatan');
  assert.equal(areaOf('Jl. Mawar 5, Bandung'), null);
});

test('time ago in Indonesian', () => {
  const now = Date.parse('2026-11-06T05:00:00Z');
  assert.equal(timeAgo(now - 2 * 60_000, now), 'baru saja');
  assert.equal(timeAgo(now - 25 * 60_000, now), '25 menit lalu');
  assert.equal(timeAgo(now - 3 * 3_600_000, now), '3 jam lalu');
  assert.equal(timeAgo(now - 30 * 3_600_000, now), 'kemarin');
  assert.equal(timeAgo(now - 4 * 86_400_000, now), '4 hari lalu');
});

test('buyer name: first two letters of the first name only, titles skipped', () => {
  assert.equal(maskedName('Rini Wijaya'), 'Ri***');
  assert.equal(maskedName('ibu sari'), 'Sa***');
  assert.equal(maskedName('Kak Ilona 🌸'), 'Il***');
  assert.equal(maskedName('A'), 'A***');
  assert.equal(maskedName('  '), null);
  assert.equal(maskedName(null), null);
});

test('an order of several products becomes one snack bar line per product, still one order today', async () => {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-sp-')), 'test.db'));
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.raw.exec(readFileSync(new URL(f, dir), 'utf8'));
  db.raw.exec(`INSERT OR REPLACE INTO current_inventory (id, babiManis, babiAsin, sapiManis, sapiAsin, updatedAt) VALUES ('current', 10, 10, 10, 10, 0);
    INSERT INTO resellers (id, reseller, parentReseller, updatedAt) VALUES ('r1', 'Alang', NULL, 0);`);
  const now = Date.now();
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  await createOrder(db, { reseller: 'Alang', parentReseller: null, recipientName: 'Janti Wijaya', phone: '0812', address: 'Jl. A 1, Jakarta Barat', deliveryDate: today, promo: 'None', babiManis: 4, babiAsin: 0, sapiManis: 2, sapiAsin: 0 }, null);
  const sp = await loadSocialProof(db, now + 1000);
  assert.deepEqual(
    sp.recent.map((r) => [r.name, r.area, r.qty, r.product, r.order]),
    [['Ja***', 'Jakarta Barat', 4, 'Babi Marinade Manis', 0], ['Ja***', 'Jakarta Barat', 2, 'Sapi Marinade Manis', 0]],
  );
  assert.equal(sp.todayOrders, 1);
});
