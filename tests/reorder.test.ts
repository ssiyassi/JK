// Daily WhatsApp reorder reminders (src/lib/marketing/reorder.ts). Run with: npm test
/* eslint-disable @typescript-eslint/no-explicit-any -- a tiny fake D1 that records the query window */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyReorderContacts, dailyReorderText, reorderMessage } from '../src/lib/marketing/reorder.ts';

test('reminders look at the whole Jakarta day delivered 14 and 30 days ago', async () => {
  const windows: [number, number][] = [];
  const db = { prepare: () => ({ bind: (a: number, b: number) => ({ all: async () => (windows.push([a, b]), { results: [] }) }) }) } as any;
  const now = Date.parse('2026-11-25T09:05:00+07:00');
  const r = await dailyReorderContacts(db, now);
  assert.deepEqual(r, { first: [], second: [] });
  assert.deepEqual(windows, [
    [Date.parse('2026-11-11T00:00:00+07:00'), Date.parse('2026-11-12T00:00:00+07:00')],
    [Date.parse('2026-10-26T00:00:00+07:00'), Date.parse('2026-10-27T00:00:00+07:00')],
  ]);
});

test('the CMO message lists both groups with WhatsApp links, and nothing is sent when nobody is due', () => {
  assert.equal(dailyReorderText({ first: [], second: [] }), null);
  const c = { orderId: '1', name: 'Ani', phone: '6281', deliveredDay: '2026-11-11', voucherCode: null, waLink: 'https://wa.me/6281?text=x' };
  const text = dailyReorderText({ first: [c], second: [{ ...c, orderId: '2', voucherCode: 'M20' }] })!;
  assert.match(text, /reminders today \(2\)/);
  assert.match(text, /1\. Ani \(#1, delivered 2026-11-11\)\nhttps:\/\/wa\.me/);
  assert.match(text, /2nd reminder\):\n2\. Ani \(#2, delivered 2026-11-11, voucher M20\)/);
  assert.match(reorderMessage('Ani', null, 2), /Jentis Kitchen lagi/);
  assert.doesNotMatch(reorderMessage('Ani', null, 1), /voucher/);
});
