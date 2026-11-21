// Payday Promo page + reseller WhatsApp message. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import {
  DEFAULT_PAYDAY_TEMPLATE, getPaydayPromo, paydayEnded, paydayLink, paydayMessage, paydayMonth, paydayPeriod, savePaydayPromo,
} from '../src/lib/shop/payday.ts';
import { isStandalonePage } from '../src/lib/shop/catalog.ts';
import { addPromoPhoto, listPromoPhotos, removePromoPhoto } from '../src/lib/shop/promo-photos.ts';

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-payday-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0003_online_shop.sql', '0005_shop_content.sql', '0007_banner_mobile_image.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  return db;
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('defaults: October 2026 poster, 25-31 Oktober, the owner message', async () => {
  const p = await getPaydayPromo(freshDb());
  assert.equal(p.image, '/shop/reseller/payday-okt-2026.jpg');
  assert.equal(paydayMonth(p), 'Oktober');
  assert.equal(paydayPeriod(p), '25 – 31 Oktober 2026');
  assert.equal(
    paydayMessage(DEFAULT_PAYDAY_TEMPLATE, 'Michelle', 'Oktober', paydayLink(p)),
    [
      'Halo kak Michelle',
      'Kita udah mau masuk lagi nih ke Payday Promo bulan Oktober',
      'Coba buka PO lagi yuk biar bisa dapet komisi dan reward bulananya lagi yang sekarang makin gampang dan menarik.',
      'https://jentiskitchen.id/payday-promo?v=1',
    ].join('\n'),
  );
});

test('period text across months and years; ended after the last Jakarta day', () => {
  assert.equal(paydayPeriod({ startDate: '2026-11-28', endDate: '2026-12-03' }), '28 November – 3 Desember 2026');
  assert.equal(paydayPeriod({ startDate: '2026-12-29', endDate: '2027-01-02' }), '29 Desember 2026 – 2 Januari 2027');
  assert.equal(paydayPeriod({ startDate: '2026-11-25', endDate: '2026-11-25' }), '25 November 2026');
  assert.equal(paydayEnded({ endDate: '2026-10-31' }, Date.parse('2026-10-31T16:59:00Z')), false); // 31 Oct 23:59 WIB
  assert.equal(paydayEnded({ endDate: '2026-10-31' }, Date.parse('2026-10-31T17:00:00Z')), true); // 1 Nov 00:00 WIB
});

test('template placeholders, any capitals', () => {
  assert.equal(paydayMessage('Hi {{Reseller Name}} / {{NAMA}} – {{Month}} {{bulan}} {{ link }}', 'Budi', 'November', 'L'), 'Hi Budi / Budi – November November L');
});

test('save: dates, texts, new poster replaces the old one, new link each save', async () => {
  const db = freshDb();
  const body = { startDate: '2026-11-25', endDate: '2026-11-30', caption: 'A\nB', whatsappTemplate: 'Halo {{reseller name}} {{link}}' };
  const first = await savePaydayPromo(db, { ...body, image: png }, 1000);
  assert.match(first.image, /^\/shop\/media\/[0-9a-f-]{36}$/);
  assert.equal(paydayMonth(first), 'November');
  const firstMedia = first.imageMediaId;

  const second = await savePaydayPromo(db, { ...body, caption: 'C' }, 2000); // no image: keeps the poster
  assert.equal(second.imageMediaId, firstMedia);
  assert.equal(second.caption, 'C');
  assert.notEqual(paydayLink(second), paydayLink(first));

  const third = await savePaydayPromo(db, { ...body, image: png }, 3000);
  assert.notEqual(third.imageMediaId, firstMedia);
  assert.equal(Number((db.raw.prepare('SELECT COUNT(*) n FROM shop_media').get() as { n: number }).n), 1); // old poster removed

  await assert.rejects(savePaydayPromo(db, { ...body, endDate: '2026-11-20' }, 4000), /end date/);
  await assert.rejects(savePaydayPromo(db, { ...body, startDate: '' }, 4000), /start date/);
  await assert.rejects(savePaydayPromo(db, { ...body, caption: '  ' }, 4000), /Caption is required/);
});

test('payday page is standalone (no shop header or footer)', () => {
  assert.equal(isStandalonePage('/payday-promo'), true);
  assert.equal(isStandalonePage('/shop/payday-promo'), true);
  assert.equal(isStandalonePage('/checkout'), false);
});

test('promo photos: starts with the 10 built-in photos + reward poster; add at the end, remove any', async () => {
  const db = freshDb();
  let photos = await listPromoPhotos(db);
  assert.equal(photos.length, 11);
  assert.deepEqual(photos[0], { id: 'builtin-foto-01', full: '/shop/reseller/foto/foto-01.jpg', thumb: '/shop/reseller/foto/foto-01-thumb.jpg', label: 'Foto produk 1' });
  assert.equal(photos[10].label, 'Poster hadiah reseller');

  const added = await addPromoPhoto(db, { image: png, thumb: png }, 1000);
  assert.match(added.full, /^\/shop\/media\//);
  assert.notEqual(added.thumb, added.full);
  photos = await listPromoPhotos(db);
  assert.equal(photos.at(-1)!.id, added.id);
  const media = () => Number((db.raw.prepare('SELECT COUNT(*) n FROM shop_media').get() as { n: number }).n);
  assert.equal(media(), 2);

  await removePromoPhoto(db, added.id);
  assert.equal(media(), 0); // its images are deleted
  await removePromoPhoto(db, 'builtin-foto-03');
  photos = await listPromoPhotos(db);
  assert.equal(photos.length, 10);
  assert.ok(!photos.some((p) => p.id === 'builtin-foto-03'));
  await assert.rejects(removePromoPhoto(db, 'nope'), /not found/);
  await assert.rejects(addPromoPhoto(db, {}, 2000), /choose a photo/);
});
