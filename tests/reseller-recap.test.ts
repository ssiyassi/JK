// Sunday reseller reward recap email. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { createOrder } from '../src/lib/core/orders.ts';
import { createReseller, listResellersAlphabetical, updateResellerLabelName, updateResellerPhone } from '../src/lib/core/resellers.ts';
import { CASH_TIERS, FREE_BOX_TIERS, earnedRewards, recapPeriod, resellerRewardRecap, rewardMessage, shortDate, whatsappUrl } from '../src/lib/notify/reseller-recap.ts';
import { resellerAnnouncementEmails, resellerRecapEmail } from '../src/lib/shop/email.ts';
import { createAnnouncement, emailAnnouncement, emailPendingAnnouncements } from '../src/lib/notify/reseller-announce.ts';
import { buildStampCard, checkStampMilestones, milestonesReached, stampAlertText, stampCardsForPhone } from '../src/lib/notify/stamps.ts';

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-recap-')), 'test.db'));
  for (const f of ['0001_existing_schema.sql', '0002_operation_keys.sql', '0003_online_shop.sql', '0005_shop_content.sql', '0023_payday_promo.sql', '0024_promo_photos.sql', '0006_website_only_products.sql', '0008_shipping_and_cancel_reason.sql', '0009_notification_state.sql', '0010_website_stock_on_payment.sql', '0011_delivered_at.sql', '0015_stock_product_short_name.sql', '0016_product_box_value.sql', '0017_reseller_phone.sql', '0037_reseller_label_name.sql', '0020_voucher_campaigns.sql', '0021_voucher_settings.sql', '0022_courier_fee.sql', '0028_guest_checkout.sql', '0035_reseller_announcements.sql', '0039_reseller_stamps.sql', '0041_admin_login_as_customer.sql', '0044_shop_order_courier.sql']) {
    db.raw.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  db.raw.exec(`INSERT INTO current_inventory VALUES ('initial', 1, 1, 1, 1, 0), ('current', 500, 500, 500, 500, 0);`);
  return db;
}

// Sunday 18 Oct 2026, 12:00 WIB: week Mon 12 – Sun 18 Oct, period September & October 2026.
const sunday = Date.parse('2026-10-18T05:00:00Z');
const week = { start: '2026-10-12', end: '2026-10-18' };
const period = recapPeriod(sunday);

test('period names and dates in the reseller format', () => {
  assert.deepEqual(period, { label: 'September dan Oktober 2026', short: 'September-Oktober', tiers: CASH_TIERS, posterUrl: null });
  assert.deepEqual(recapPeriod(Date.parse('2026-12-31T16:59:00Z')), { label: 'November dan Desember 2026', short: 'November-Desember', tiers: FREE_BOX_TIERS, posterUrl: 'https://jentiskitchen.id/hadiah-reseller' });
  assert.equal(recapPeriod(Date.parse('2026-10-31T17:00:00Z')).tiers, FREE_BOX_TIERS); // 1 Nov 00:00 WIB
  assert.equal(recapPeriod(Date.parse('2027-03-01T05:00:00Z')).tiers, FREE_BOX_TIERS);
  assert.deepEqual(recapPeriod(Date.parse('2026-12-31T17:00:00Z')).short, 'Januari-Februari'); // 1 Jan 00:00 WIB
  assert.equal(shortDate('2023-11-27'), '27/11/2023');
  assert.equal(shortDate('2023-12-03'), '3/12/2023');
});

test('message: below 65 aims at Rp650.000, from 65 at Rp3.000.000, and restarts from 0 at 100', () => {
  const below = rewardMessage('Meilanni', 0, 0, week, period).text;
  assert.equal(
    below,
    [
      'Hi Meilanni, Penjualan kamu di minggu ini (12/10/2026 - 18/10/2026) adalah 0 Box, dan total penjualan kamu di periode bulan September dan Oktober 2026 adalah 0 Box.',
      '',
      '65 Box lagi menuju reward Cash September-Oktober Rp650.000,-',
      'Terima kasih sudah menjadi reseller Jentis Kitchen.',
      'Semangat !',
      'Have a nice week !',
      '-Jentis Kitchen-',
      '',
      'Apakah mau mencoba untuk open PO Daging di minggu ini atau butuh foto untuk promosi?',
    ].join('\n'),
  );
  assert.match(rewardMessage('A', 3, 64.5, week, period).text, /^0\.5 Box lagi menuju reward Cash September-Oktober Rp650\.000,-$/m);
  assert.match(rewardMessage('A', 3, 65, week, period).text, /^35 Box lagi menuju reward Cash September-Oktober Rp3\.000\.000,-$/m);
  assert.match(rewardMessage('A', 3, 99, week, period).text, /^1 Box lagi menuju .*Rp3\.000\.000/m);
  const reset = rewardMessage('A', 3, 130, week, period);
  assert.equal(reset.cycleBoxes, 30);
  assert.match(reset.text, /adalah 30 Box\.\n/);
  assert.match(reset.text, /^35 Box lagi menuju .*Rp650\.000/m);
  assert.equal(rewardMessage('A', 3, 100, week, period).cycleBoxes, 0);
});

test('from November-December 2026: free boxes at 15 and 25, cash at 65 and 100, earned again after each 100', () => {
  const nov = recapPeriod(Date.parse('2026-11-08T05:00:00Z'));
  const novWeek = { start: '2026-11-02', end: '2026-11-08' };
  const msg = (boxes: number) => rewardMessage('A', 3, boxes, novWeek, nov).text;
  assert.equal(
    msg(0),
    [
      'Hi A, Penjualan kamu di minggu ini (2/11/2026 - 8/11/2026) adalah 3 Box, dan total penjualan kamu di periode bulan November dan Desember 2026 adalah 0 Box.',
      '',
      '15 Box lagi menuju reward November-Desember: GRATIS 1 Box',
      'Terima kasih sudah menjadi reseller Jentis Kitchen.',
      'Semangat !',
      'Have a nice week !',
      '-Jentis Kitchen-',
      '',
      'Apakah mau mencoba untuk open PO Daging di minggu ini atau butuh foto untuk promosi?',
      '',
      'Info hadiah reseller: https://jentiskitchen.id/hadiah-reseller',
      'Cek kartu stamp kamu: https://jentiskitchen.id/stamp',
    ].join('\n'),
  );
  assert.match(rewardMessage('A', 3, 5, { start: '2027-01-03', end: '2027-01-10' }, recapPeriod(Date.parse('2027-01-10T05:00:00Z'))).text, /promosi\?\n\nCek kartu stamp kamu: https:\/\/jentiskitchen\.id\/stamp$/);
  assert.doesNotMatch(rewardMessage('A', 3, 5, week, period).text, /kartu stamp/); // Sep-Oct: no stamp card yet
  assert.equal(recapPeriod(Date.parse('2027-01-10T05:00:00Z')).posterUrl, null); // the Nov-Dec poster is not reused
  assert.match(msg(15), /adalah 15 Box\.\n\n10 Box lagi menuju reward November-Desember: GRATIS 2 Box LAGI\n/);
  assert.match(msg(30), /^35 Box lagi menuju reward CASH November-Desember Rp650\.000,-$/m);
  assert.match(msg(70), /^30 Box lagi menuju reward CASH November-Desember Rp2\.350\.000,- LAGI$/m);
  assert.match(msg(100), /adalah 0 Box\.\n\n15 Box lagi menuju reward November-Desember: GRATIS 1 Box\n/);
  assert.doesNotMatch(msg(116), /Reward yang sudah/); // earned rewards are shown to the owner only
  assert.equal(rewardMessage('A', 3, 116, novWeek, nov).earned, '4 Box gratis + Cash Rp3.000.000,-');
  assert.deepEqual(earnedRewards(14.5, FREE_BOX_TIERS), { freeBoxes: 0, cash: 0, text: null });
  assert.deepEqual(earnedRewards(225, FREE_BOX_TIERS), { freeBoxes: 9, cash: 6_000_000, text: '9 Box gratis + Cash Rp6.000.000,-' });
  assert.equal(rewardMessage('A', 3, 70, week, period).earned, null); // Sep-Oct: old scheme, no free-box line for the owner
});

test('WhatsApp link opens the chat with the message, or lets the owner pick a contact without a number', () => {
  assert.equal(whatsappUrl('6281234567890', 'Hi A & B'), 'https://wa.me/6281234567890?text=Hi%20A%20%26%20B');
  assert.equal(whatsappUrl(null, 'Hi'), 'https://wa.me/?text=Hi');
});

test('reseller WhatsApp numbers: 08xx is saved as 628xx, empty removes it, invalid is refused', async () => {
  const db = freshDb();
  const r = await createReseller(db, { reseller: 'Rina', phone: '0812-3456-7890' });
  assert.equal(r.phone, '6281234567890');
  assert.equal(await updateResellerPhone(db, r.id, '+62 813 1111 2222'), '6281311112222');
  assert.equal(await updateResellerPhone(db, r.id, ''), null);
  await assert.rejects(updateResellerPhone(db, r.id, '12345'), /Invalid WhatsApp number/);
  assert.equal((await createReseller(db, { reseller: 'Sinta' })).phone, null);
});

test('reseller label name: starts as the reseller name, can be changed, empty goes back to the name', async () => {
  const db = freshDb();
  const r = await createReseller(db, { reseller: 'Rina' });
  assert.equal(r.labelName, 'Rina');
  assert.equal(await updateResellerLabelName(db, r.id, '  Toko  Berkah Mama Rina '), 'Toko Berkah Mama Rina');
  assert.equal((await listResellersAlphabetical(db))[0].labelName, 'Toko Berkah Mama Rina');
  assert.equal(await updateResellerLabelName(db, r.id, ''), 'Rina');
  await assert.rejects(updateResellerLabelName(db, 'missing', 'X'), /Reseller not found/);
});

test('recap: delivered boxes only; week Sunday 12:00 to Sunday 12:00; period of the delivery day', async () => {
  const db = freshDb();
  await createReseller(db, { reseller: 'Budi', parentReseller: 'Alang', phone: '081234567890' });
  await createReseller(db, { reseller: 'Citra' });
  await createReseller(db, { reseller: 'Zero' });
  const order = async (over: Record<string, unknown>, deliveredAt: string | null, orderedAt = '2026-10-10T03:00:00Z') => {
    const { order: o } = await createOrder(db, {
      reseller: 'Budi', parentReseller: null, recipientName: 'X', phone: '0812', address: 'Jl. A',
      deliveryDate: '2026-10-14', promo: 'None', babiManis: 0, babiAsin: 0, sapiManis: 0, sapiAsin: 0, ...over,
    }, null);
    db.raw.prepare('UPDATE orders SET date = ? WHERE id = ?').run(Date.parse(orderedAt), o.id);
    if (deliveredAt) db.raw.prepare(`UPDATE orders SET deliveryStatus = 'DELIVERED', deliveredAt = ? WHERE id = ?`).run(Date.parse(deliveredAt), o.id);
  };
  await order({ parentReseller: 'Alang', babiManis: 60 }, '2026-09-07T03:00:00Z', '2026-09-05T03:00:00Z'); // period, an earlier week
  await order({ parentReseller: 'Alang', babiManis: 4 }, '2026-10-13T03:00:00Z'); // this week
  await order({ parentReseller: 'Alang', sapiManis: 3 }, '2026-10-18T06:00:00Z'); // Sunday 13:00 WIB, after the recap: next week, same period
  await order({ parentReseller: 'Alang', sapiAsin: 5 }, null); // not delivered: not counted
  await order({ reseller: 'Citra', babiAsin: 2 }, '2026-10-16T03:00:00Z');
  await order({ reseller: 'Zero', babiAsin: 9 }, '2026-08-30T03:00:00Z', '2026-08-28T03:00:00Z'); // previous period
  await createReseller(db, { reseller: 'Gone' });
  await order({ reseller: 'Gone', babiAsin: 5 }, '2026-10-16T03:00:00Z');
  db.raw.exec(`DELETE FROM resellers WHERE reseller = 'Gone'`); // removed from My Resellers: not in the recap

  const recap = await resellerRewardRecap(db, sunday);
  assert.deepEqual(recap.week, { start: '2026-10-11', end: '2026-10-18' });
  assert.deepEqual(
    recap.resellers.map((r) => [r.reseller, r.parentReseller, r.phone, r.weekBoxes, r.periodBoxes]),
    [
      ['Budi', 'Alang', '6281234567890', 4, 67],
      ['Citra', null, null, 2, 2],
    ],
  );
  assert.match(recap.resellers[0].message, /^33 Box lagi menuju reward Cash September-Oktober Rp3\.000\.000,-$/m);
  assert.ok(recap.resellers[0].whatsappUrl.startsWith('https://wa.me/6281234567890?text=Hi%20Budi%2C'));

  const email = resellerRecapEmail('owner@example.com', recap, { shopUrl: 'https://shop', adminUrl: 'https://admin' });
  assert.equal(email.to, 'owner@example.com');
  assert.equal(email.subject, 'Reseller recap 11/10/2026 - 18/10/2026 — periode September-Oktober');
  assert.match(email.html, /href="https:\/\/wa\.me\/6281234567890\?text=Hi%20Budi/);
  assert.match(email.html, /href="https:\/\/wa\.me\/\?text=Hi%20Citra/);
  assert.match(email.html, /1 belum punya nomor WhatsApp/);
  assert.doesNotMatch(email.html, /Zero/);
  assert.doesNotMatch(email.html, /Terima kasih/); // message only inside the WhatsApp link
  assert.doesNotMatch(email.html, /Reward:/); // Sep-Oct: no free-box line

  const nov = await resellerRewardRecap(db, Date.parse('2026-11-08T05:00:00Z'));
  assert.equal(nov.resellers.length, 0); // October orders are not in the new period
  const novEmail = resellerRecapEmail('o@example.com', { ...nov, resellers: [{ ...recap.resellers[0], earned: '3 Box gratis' }] }, { shopUrl: 'https://shop', adminUrl: 'https://admin' });
  assert.match(novEmail.html, /Reward: 3 Box gratis/);
});

const ANNOUNCEMENT = `*KABAR GEMBIRA untuk RESELLER JENTIS KITCHEN !!*
Skema Reward baru JENTIS KITCHEN !!!

*Penjualan 15 box --> Mendapatkan free 1 Box daging*
Total keuntungan 15 Box X 20.000 / box = 300.000 + 160.000 (Harga 1 box daging) = 460.000

*Penjualan 25 box --> Mendapatkan free 2 Box daging LAGI* (Total 3 box)
Total keuntungan 25 Box X 20.000 / box = 500.000 + 480.000 (Harga 3 box daging) = 980.000

*Penjualan 65 box --> Mendapatkan REWARD CASH 650.000*
Total keuntungan 65 Box X 20.000 / box = 1.300.000 + 480.000 (Harga 3 box daging) + 650.000 = 2.430.000

*Penjualan 100 box --> Mendapatkan REWARD CASH 2.350.000*
Total keuntungan 100 Box X 20.000 / box = 2.000.000 + 480.000 (Harga 3 box daging) + 650.000 + 2.350.000 = 5.480.000

Ayok kejar sistem skema Reward JENTIS KITCHEN dengan *LEBIH MUDAH*
https://jentiskitchen.id/hadiah-reseller
Kalau ada pertanyaan silahkan ditanyakan yaaa

Balas *STOP* untuk berhenti menjadi reseller Jentis Kitchen / berhenti menerima pengumuman

Terima kasih`;

test('announcement emails: 40 resellers per email, each under Gmail\'s ~100 KB limit, message filled in per reseller', () => {
  const resellers = Array.from({ length: 209 }, (_, i) => ({ reseller: `Reseller Nama Panjang ${i + 1}`, parentReseller: i % 3 ? null : 'Vivi', phone: i === 5 ? null : `62812${String(10000000 + i)}` }));
  const emails = resellerAnnouncementEmails('owner@example.com', ANNOUNCEMENT, resellers, 'https://admin');
  assert.equal(emails.length, 6);
  assert.equal(emails[0].subject, 'Pengumuman reseller — bagian 1 dari 6 (reseller 1–40)');
  assert.equal(emails[5].subject, 'Pengumuman reseller — bagian 6 dari 6 (reseller 201–209)');
  for (const e of emails) assert.ok(new TextEncoder().encode(e.html).length < 95_000, `${e.subject}: ${e.html.length}`);
  const links = emails.flatMap((e) => [...e.html.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&')));
  assert.equal(links.length, 209);
  assert.ok(links[0].startsWith('https://wa.me/6281210000000?text=*KABAR%20GEMBIRA'));
  assert.equal(decodeURIComponent(links[0].split('?text=')[1]), ANNOUNCEMENT);
  assert.ok(links[5].startsWith('https://wa.me/?text=')); // no number: owner picks the chat
  assert.match(emails[0].html, /Pengumuman untuk <b>209<\/b> reseller/);

  const personal = resellerAnnouncementEmails('o', 'Halo kak {{reseller name}}!', [{ reseller: 'Budi', parentReseller: null, phone: '6281' }], 'a');
  assert.match(personal[0].html, /text=Halo%20kak%20Budi!/);
});

test('announcements: sent right away, or by the 15-minute job once; released for a retry when no email went out', async () => {
  const db = freshDb();
  await createReseller(db, { reseller: 'Budi', phone: '081234567890' });
  await createReseller(db, { reseller: 'Ani' });
  const sentEmails: string[] = [];
  const ok = async (emails: { subject: string }[]) => { emails.forEach((e) => sentEmails.push(e.subject)); return emails.length; };

  const now = await createAnnouncement(db, 'Halo', 1000, true);
  assert.deepEqual(await emailAnnouncement(db, now, 'o@x', ok, 'https://admin'), { emails: 1, sent: 1, resellers: 2 });
  assert.equal((await emailPendingAnnouncements(db, 'o@x', ok, 'https://admin', 2000)).done, 0); // already emailed

  await createAnnouncement(db, 'Lewat database', 3000, false); // e.g. added straight into the database
  const fail = async () => 0;
  assert.equal((await emailPendingAnnouncements(db, 'o@x', fail, 'https://admin', 4000)).done, 0); // email down: released
  assert.equal((await emailPendingAnnouncements(db, 'o@x', ok, 'https://admin', 5000)).done, 1); // retried
  assert.equal((await emailPendingAnnouncements(db, 'o@x', ok, 'https://admin', 6000)).done, 0); // once only
  assert.equal(sentEmails.length, 2);
  await assert.rejects(createAnnouncement(db, '  ', 7000, true), /write the message/);
});

test('stamp card: 4 levels (15 / +10 / +40 / +35), states, boxes left, rounds after 100, half boxes fill no stamp', () => {
  const d = (boxes: number, day: number) => ({ orderId: `o${day}`, deliveredAt: Date.parse(`2026-11-${String(day).padStart(2, '0')}T03:00:00Z`), boxes });
  const card = buildStampCard({ reseller: 'Michelle', parentReseller: null }, [d(20, 5), d(17, 12)], 'November dan Desember 2026');
  assert.equal(card.total, 37);
  assert.deepEqual(card.levels.map((l) => [l.level, l.name, l.from, l.upTo, l.filled, l.state]), [
    [1, 'PEMULA', 0, 15, 15, 'done'],
    [2, 'JAGOAN', 15, 25, 10, 'done'],
    [3, 'JURAGAN', 25, 65, 12, 'now'],
    [4, 'SULTAN', 65, 100, 0, 'lock'],
  ]);
  assert.deepEqual(card.next, { left: 28, reward: 'CASH Rp650.000', level: 3, name: 'JURAGAN' });
  assert.deepEqual(card.recent.map((r) => r.orderId), ['o12', 'o5']);

  const empty = buildStampCard({ reseller: 'A', parentReseller: null }, [], 'x');
  assert.deepEqual(empty.levels.map((l) => l.state), ['now', 'lock', 'lock', 'lock']);
  assert.equal(empty.next!.left, 15);

  const exact = buildStampCard({ reseller: 'A', parentReseller: null }, [d(25, 1)], 'x');
  assert.deepEqual(exact.levels.map((l) => l.state), ['done', 'done', 'now', 'lock']);

  const half = buildStampCard({ reseller: 'A', parentReseller: null }, [d(14.5, 1)], 'x');
  assert.equal(half.levels[0].filled, 14);
  assert.equal(half.next!.left, 0.5);

  const second = buildStampCard({ reseller: 'A', parentReseller: null }, [d(116, 1)], 'x');
  assert.deepEqual([second.round, second.roundBoxes, second.levels[0].state, second.levels[1].filled, second.next!.left], [1, 16, 'done', 1, 9]);
});

test('stamp milestones: every filled level once, again in the next round', () => {
  assert.deepEqual(milestonesReached('A', 14).map((m) => m.milestone), []);
  assert.deepEqual(milestonesReached('A', 65).map((m) => m.milestone), [15, 25, 65]);
  assert.deepEqual(milestonesReached('A', 125).map((m) => m.milestone), [15, 25, 65, 100, 115, 125]);
  const m = milestonesReached('Michelle', 66)[2];
  assert.equal(stampAlertText(m, 'November dan Desember 2026', 'Vivi'), [
    '🏆 Stamp reward: Michelle (parent Vivi)',
    'filled Level 3 JURAGAN',
    'Reward: CASH Rp650.000',
    'Periode November dan Desember 2026 · 66 box delivered',
  ].join('\n'));
  assert.match(stampAlertText(milestonesReached('A', 115)[4], 'x', null), /filled Level 1 PEMULA \(round 2\)/);
});

test('stamp portal + alerts: delivered boxes of this period by phone; each filled level alerted once, retried when Telegram fails', async () => {
  const db = freshDb();
  await createReseller(db, { reseller: 'Budi', parentReseller: 'Alang', phone: '081234567890' });
  await createReseller(db, { reseller: 'Budi Toko', phone: '0812-3456-7890' }); // same number, second reseller
  await createReseller(db, { reseller: 'Citra', phone: '081111111111' });
  const order = async (reseller: string, parentReseller: string | null, babiManis: number, deliveredAt: string | null) => {
    const { order: o } = await createOrder(db, {
      reseller, parentReseller, recipientName: 'X', phone: '0812', address: 'Jl. A', deliveryDate: '2026-11-05', promo: 'None',
      babiManis, babiAsin: 0, sapiManis: 0, sapiAsin: 0,
    }, null);
    if (deliveredAt) db.raw.prepare(`UPDATE orders SET deliveryStatus = 'DELIVERED', deliveredAt = ? WHERE id = ?`).run(Date.parse(deliveredAt), o.id);
  };
  await order('Budi', 'Alang', 9, '2026-11-03T03:00:00Z');
  await order('Budi', 'Alang', 8, '2026-11-10T03:00:00Z'); // 17 in Nov-Dec: Level 1 filled
  await order('Budi', 'Alang', 7, null); // not delivered yet
  await order('Budi', 'Alang', 40, '2026-10-30T03:00:00Z'); // Sep-Oct: not on this card
  await order('Citra', null, 3, '2026-11-04T03:00:00Z');
  const now = Date.parse('2026-11-15T05:00:00Z');

  const cards = await stampCardsForPhone(db, '6281234567890', now);
  assert.deepEqual(cards.map((c) => [c.reseller, c.total, c.periodLabel]), [['Budi', 17, 'November dan Desember 2026'], ['Budi Toko', 0, 'November dan Desember 2026']]);
  assert.equal(cards[0].levels[1].filled, 2);
  assert.deepEqual(await stampCardsForPhone(db, '6289999999999', now), []);

  const sent: string[] = [];
  const ok = async (texts: string[]) => { sent.push(...texts); return texts.length; };
  assert.equal(await checkStampMilestones(db, async () => 0, now), 0); // Telegram down: released
  assert.equal(await checkStampMilestones(db, ok, now), 1);
  assert.match(sent[0], /^🏆 Stamp reward: Budi \(parent Alang\)\nfilled Level 1 PEMULA/);
  assert.equal(await checkStampMilestones(db, ok, now), 0); // once only
  await order('Budi', 'Alang', 10, '2026-11-14T03:00:00Z'); // 27: Level 2 filled
  assert.equal(await checkStampMilestones(db, ok, now), 1);
  assert.match(sent[1], /filled Level 2 JAGOAN/);
  // A new period starts from 0 again (no alerts carried over).
  assert.equal(await checkStampMilestones(db, ok, Date.parse('2027-01-05T05:00:00Z')), 0);
});
