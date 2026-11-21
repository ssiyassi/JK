// Fallback: re-sends today's daily marketing report as a PDF from the laptop (local Chrome) when the Worker's
// automatic PDF did not arrive. Copies the live database read-only; nothing on the live site is changed.
//   node scripts/daily-report-pdf.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from '../tests/sqlite-d1.ts';
import { collectDailyReport, reportHtml, rp, signed } from '../src/lib/marketing/reportPdf.ts';
import { SYNC_STATE_KEY } from '../src/lib/marketing/metaAds.ts';

const ROOT = new URL('../', import.meta.url).pathname;
const work = join(tmpdir(), 'jentis-daily-report');
mkdirSync(work, { recursive: true });
const sql = join(work, 'prod.sql');
const dbFile = join(work, 'prod.db');
rmSync(sql, { force: true });
rmSync(dbFile, { force: true });
execFileSync('npx', ['wrangler', 'd1', 'export', 'jentis-db-prod', '--remote', '--env=', `--output=${sql}`], { cwd: ROOT, stdio: 'ignore' });
execFileSync('sqlite3', [dbFile], { input: readFileSync(sql) });

const db = sqliteD1(dbFile);
const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>();
const lastSync = state ? Number(JSON.parse(state.value).lastSuccess ?? 0) || null : null;
const data = await collectDailyReport(db, Date.now(), lastSync);
const html = join(work, 'daily.html');
writeFileSync(html, reportHtml(data, `file://${ROOT}public/shop/brand/logo.png`));
const pdf = join(work, `Jentis-Marketing-Report-${data.day}.pdf`);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--no-pdf-header-footer', '--virtual-time-budget=5000', `--print-to-pdf=${pdf}`, `file://${html}`,
], { stdio: 'ignore' });
const yAfter = data.yesterday.profit === null ? null : data.yesterday.profit - data.yesterday.spend;
const tAfter = data.total.profit === null ? null : data.total.profit - data.total.spend;
const caption = [
  `📊 Daily marketing report — ${data.day}`,
  `Yesterday: ${data.orders.length} paid orders · ${rp(data.yesterday.revenue)} · profit after ads ${yAfter === null ? '?' : signed(yAfter)}`,
  tAfter === null ? '' : `Since ${data.since}: profit after ads ${signed(tAfter)}`,
  data.questions.length ? `❓ ${data.questions.length} question(s) for you inside` : '✅ Nothing needs your decision today',
].filter(Boolean).join('\n');
const { sendFile } = await import('./telegram-cmo.mjs');
await sendFile(pdf, caption);
console.log(`sent ${pdf}`);
