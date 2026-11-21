// Retries + the error report on the Reporting bot (src/lib/notify/retry.ts). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { errorText, reportFailure, retryTiming, runPeriodJob, trackRecurring, withRetry } from '../src/lib/notify/retry.ts';
import { sendTelegramMessages, telegramNotifier } from '../src/lib/notify/telegram.ts';

retryTiming.delaysMs = [0, 0]; // no waiting between tries in tests

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-retry-')), 'test.db'));
  db.raw.exec(readFileSync(new URL('../migrations/0009_notification_state.sql', import.meta.url), 'utf8'));
  return db;
}

const env = { TELEGRAM_CHAT_ID: '42', TELEGRAM_SHIPPING_BOT_TOKEN: 'ship', TELEGRAM_REPORTING_BOT_TOKEN: 'report' };
const quiet = () => {};
const NOW = Date.parse('2026-10-29T12:00:00Z'); // 19:00 WIB
const MIN = 60 * 1000;

/** Fake Telegram: records each message per bot token; `fail(token)` decides whether a call fails. */
function fakeTelegram(fail: (token: string, call: number) => boolean = () => false) {
  const sent: { token: string; text: string }[] = [];
  let calls = 0;
  const fetchFn = async (url: string, init: RequestInit) => {
    const token = url.split('/bot')[1].split('/')[0];
    if (fail(token, ++calls)) return new Response('{"ok":false,"description":"Bad Gateway"}', { status: 502 });
    sent.push({ token, text: JSON.parse(String(init.body)).text });
    return new Response('{"ok":true}');
  };
  return { sent, fetchFn, reports: () => sent.filter((m) => m.token === 'report') };
}

test('withRetry: succeeds on the 2nd try; gives up after 3 with the last error', async () => {
  let tries = 0;
  assert.equal(await withRetry(async () => { if (++tries < 2) throw new Error('flaky'); return 'ok'; }), 'ok');
  assert.equal(tries, 2);
  tries = 0;
  await assert.rejects(withRetry(async () => { tries++; throw new Error(`down ${tries}`); }), /down 3/);
  assert.equal(tries, 3);
});

test('Telegram: a non-ok response counts as a failure and is retried; the 2nd try sends it once', async () => {
  const tg = fakeTelegram((_t, call) => call === 1);
  assert.equal(await sendTelegramMessages(env, 'shipping', ['hello'], tg.fetchFn, 0), 1);
  assert.deepEqual(tg.sent, [{ token: 'ship', text: 'hello' }]);
});

test('notifier: 3 failed tries → exactly one report on the Reporting bot, without secrets or contact details', async () => {
  const db = freshDb();
  const tg = fakeTelegram((token) => token === 'orders');
  const notify = telegramNotifier({ ...env, TELEGRAM_ORDERS_BOT_TOKEN: 'orders', DB: db }, 'orders', tg.fetchFn, quiet);
  assert.equal(await notify('order 1'), false);
  assert.equal(await notify('order 2'), false); // same job, same day: no second report
  assert.equal(tg.reports().length, 1);
  assert.match(tg.reports()[0].text, /Telegram order alert/);
  assert.match(tg.reports()[0].text, /Tried 3 times, then gave up/);
  assert.match(tg.reports()[0].text, /Bad Gateway/);
  assert.equal(errorText(new Error('POST https://api.telegram.org/bot123:ABC-def/sendMessage to a@b.co 0812 3456 7890 failed')),
    'POST https://api.telegram.org/bot***/sendMessage to [email] [number] failed');
});

test('reportFailure: a failing Reporting bot is only logged, never thrown', async () => {
  const tg = fakeTelegram(() => true);
  const logged: string[] = [];
  assert.equal(await reportFailure({ ...env, DB: freshDb() }, { job: 'x', what: 'X', error: 'boom' }, { now: NOW, fetchFn: tg.fetchFn, log: (_l, e) => logged.push(e) }), false);
  assert.deepEqual(logged, ['job_gave_up', 'failure_report_failed']);
});

test('period job: fails, then works on the next 15-minute run; never runs twice once done', async () => {
  const db = freshDb();
  const tg = fakeTelegram();
  let tries = 0;
  const job = { name: 'daily-summary', what: 'Delivery list', period: '2026-10-29' };
  const work = async () => { if (++tries === 1) throw new Error('D1 busy'); };
  const opts = { fetchFn: tg.fetchFn, log: quiet };
  assert.equal(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW }), 'retry');
  assert.equal(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW + 1000, retry: true }), 'skipped'); // too soon
  assert.equal(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW + 15 * MIN, retry: true }), 'done');
  assert.equal(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW + 30 * MIN, retry: true }), 'skipped');
  assert.equal(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW + 45 * MIN }), 'skipped'); // cron fired twice
  assert.equal(tries, 2);
  assert.equal(tg.reports().length, 0);
  // A retry never starts a job whose own cron has not run for this period yet.
  assert.equal(await runPeriodJob({ ...env, DB: db }, { ...job, period: '2026-10-30' }, work, { ...opts, now: NOW + 24 * 60 * MIN, retry: true }), 'skipped');
});

test('period job: gives up after 3 tries with exactly one report; bubbles already sent are not sent again', async () => {
  const db = freshDb();
  // The 3rd bubble always fails; bubbles 1 and 2 must go out once only.
  const tg = fakeTelegram((token, _c) => token === 'ship' && failing);
  let failing = false;
  const job = { name: 'daily-summary', what: 'Telegram delivery list for tomorrow', period: '2026-10-29' };
  const messages = ['bubble 1', 'bubble 2', 'bubble 3'];
  const work = async (ctx: { progress: number; advance: () => Promise<void> }) => {
    let i = ctx.progress;
    await sendTelegramMessages(env, 'shipping', messages.slice(i), async (url, init) => {
      failing = i === 2;
      return tg.fetchFn(url, init);
    }, 0, { onSent: async () => { i++; await ctx.advance(); } });
  };
  const opts = { fetchFn: tg.fetchFn, log: quiet };
  const outcomes = [];
  for (let run = 0; run < 5; run++) {
    outcomes.push(await runPeriodJob({ ...env, DB: db }, job, work, { ...opts, now: NOW + run * 15 * MIN, retry: run > 0 }));
  }
  assert.deepEqual(outcomes, ['retry', 'retry', 'gave-up', 'skipped', 'skipped']);
  assert.deepEqual(tg.sent.filter((m) => m.token === 'ship').map((m) => m.text), ['bubble 1', 'bubble 2']);
  assert.equal(tg.reports().length, 1);
  assert.match(tg.reports()[0].text, /Automatic job failed: Telegram delivery list for tomorrow/);
  assert.match(tg.reports()[0].text, /When: 29 Oct 2026, 19:\d\d WIB/);
});

test('recurring check: one report after 3 failures in a row; a success resets the count', async () => {
  const db = freshDb();
  const tg = fakeTelegram();
  const job = { name: 'low-stock-check', what: 'Low stock check' };
  const opts = { fetchFn: tg.fetchFn, log: quiet };
  const run = (error: unknown, i: number) => trackRecurring({ ...env, DB: db }, job, error, { ...opts, now: NOW + i * 15 * MIN });
  await run(new Error('down'), 0);
  await run(new Error('down'), 1);
  await run(null, 2); // worked: back to 0
  await run(new Error('down'), 3);
  await run(new Error('down'), 4);
  assert.equal(tg.reports().length, 0);
  await run(new Error('down'), 5);
  await run(new Error('down'), 6);
  assert.equal(tg.reports().length, 1);
  assert.match(tg.reports()[0].text, /keeps trying every 15 minutes/);
});

test('Telegram: a timed-out send is not retried (it usually did arrive), so the owner gets one alert, not three', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls++;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  };
  assert.equal(await sendTelegramMessages(env, 'shipping', ['order'], fetchFn, 0), 1);
  assert.equal(calls, 1);
});
