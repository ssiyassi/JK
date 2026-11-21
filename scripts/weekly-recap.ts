// Weekly marketing recap (run from the laptop every Monday by the "weekly-marketing-recap" scheduled task).
//   node scripts/weekly-recap.ts data <monday>   → copies the live database (read-only export) and prints the week's
//                                                   numbers as JSON, plus last week's review for context
//   node scripts/weekly-recap.ts send <monday>   → renders the PDF with marketing/reports/<monday>-weekly-review.json
//                                                   and sends it to the owner's Telegram (CMO bot)
//   node scripts/weekly-recap.ts reorder <today> → experiment 2: sends the owner the customers to remind on WhatsApp
//                                                   (delivered 10–16 days ago, no new order), with ready-made links
// <monday> = first day of the week to report (YYYY-MM-DD, WIB). Nothing on the live site is changed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from '../tests/sqlite-d1.ts';
import { collectWeeklyReport, weeklyHtml } from '../src/lib/marketing/weeklyReport.ts';
import { addDaysToKey } from '../src/lib/core/time.ts';
import { reorderContacts } from '../src/lib/marketing/reorder.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const [mode, monday] = process.argv.slice(2);
if (!['data', 'send', 'reorder'].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(monday ?? '')) {
  console.error('usage: node scripts/weekly-recap.ts data|send|reorder YYYY-MM-DD');
  process.exit(2);
}
const work = join(tmpdir(), `jentis-weekly-${monday}`);
mkdirSync(work, { recursive: true });
const dbFile = join(work, 'prod.db');

if (mode !== 'send' || !existsSync(dbFile)) {
  const sql = join(work, 'prod.sql');
  rmSync(sql, { force: true });
  rmSync(dbFile, { force: true });
  execFileSync('npx', ['wrangler', 'd1', 'export', 'jentis-db-prod', '--remote', '--env=', `--output=${sql}`], { cwd: ROOT, stdio: 'ignore' });
  execFileSync('sqlite3', [dbFile], { input: readFileSync(sql) });
}
if (mode === 'reorder') {
  const now = new Date(`${monday}T08:00:00+07:00`).getTime();
  const contacts = await reorderContacts(sqliteD1(dbFile), now);
  const { sendText } = await import('./telegram-cmo.mjs');
  const lines = contacts.length
    ? [
        `📲 Re-order reminders (${contacts.length}) — customers delivered 10–16 days ago who haven't ordered again.`,
        'Tap a link → WhatsApp opens with the message ready → Send.',
        '',
        ...contacts.map((c, i) => `${i + 1}. ${c.name} (#${c.orderId}, delivered ${c.deliveredDay}${c.voucherCode ? `, voucher ${c.voucherCode}` : ''})\n${c.waLink}`),
      ]
    : ['📲 Re-order reminders: nobody is due this week (no website orders delivered 10–16 days ago without a new order).'];
  await sendText(lines.join('\n'));
  console.log(`sent ${contacts.length} reminder(s)`);
  process.exit(0);
}
const data = await collectWeeklyReport(sqliteD1(dbFile), monday);
const reviewFile = join(ROOT, 'marketing/reports', `${monday}-weekly-review.json`);

if (mode === 'data') {
  const prevFile = join(ROOT, 'marketing/reports', `${addDaysToKey(monday, -7)}-weekly-review.json`);
  console.log(JSON.stringify({ data, lastWeekReview: existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, 'utf8')) : null, reviewFile }, null, 1));
} else {
  const review = JSON.parse(readFileSync(reviewFile, 'utf8'));
  const html = join(work, 'weekly.html');
  writeFileSync(html, weeklyHtml(data, review, `file://${ROOT}public/shop/brand/logo.png`));
  const pdf = join(work, `Jentis-Weekly-Recap-${monday}.pdf`);
  execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-pdf-header-footer', '--virtual-time-budget=5000', `--print-to-pdf=${pdf}`, `file://${html}`,
  ], { stdio: 'ignore' });
  const { sendFile, sendText } = await import('./telegram-cmo.mjs');
  const w = data.week;
  const after = w.profit === null ? null : Math.round(w.profit - w.spend);
  await sendText(
    `📅 Weekly marketing recap — ${data.from} to ${data.to}\n${w.orders} paid orders · Rp ${w.revenue.toLocaleString('id-ID')} · profit after ads ${after === null ? '?' : `${after >= 0 ? '+' : '−'}Rp ${Math.abs(after).toLocaleString('id-ID')}`}\n${review.experiments.length ? `${review.experiments.length} experiment(s) proposed — they need your OK` : ''}`.trim(),
  );
  await sendFile(pdf, `Weekly recap ${data.from}`);
  console.log(`sent ${pdf}`);
}
