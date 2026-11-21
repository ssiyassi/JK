// Work done by the Cron Triggers (see wrangler.jsonc and custom-worker.ts).
import type { D1Database } from '../core/d1.ts';
import { metaPurchaseNotifier, type MetaEnv } from '../notify/meta.ts';
import { checkLowStock, formatDayKey, sendDailySummary, sendParentRecap, sendTelegramMessages, telegramConfigured, telegramNotifier, type TelegramEnv } from '../notify/telegram.ts';
import { resellerRewardRecap } from '../notify/reseller-recap.ts';
import { emailLinksFromEnv, paymentGatewaysFromEnv, type ShopEnv } from './config.ts';
import { alertUnpaidOrders, expireUnpaidOrders, metaPurchaseAgain, paidEmailsAgain } from './events.ts';
import { monthlyProfitEmail, resellerRecapEmail } from './email.ts';
import { addMonths, monthKeyOf, monthlyProfit } from '../core/costs.ts';
import { sendEmailsOrThrow, sendEmailsQuietly, sendEmailsWith } from './mailer.ts';
import { MAX_ATTEMPTS, reportFailure, runPeriodJob, trackRecurring, withRetry, type JobContext } from '../notify/retry.ts';
import { jakartaDateKey } from '../core/time.ts';
import { emailPendingAnnouncements } from '../notify/reseller-announce.ts';
import { checkStampMilestones } from '../notify/stamps.ts';
import { SYNC_STATE_KEY, syncMetaAds, type MetaAdsEnv } from '../marketing/metaAds.ts';
import { buildDailyReport, markReportSent, reportDue } from '../marketing/adsReport.ts';
import { checkoutLeadsAlert, pruneCheckoutLeads } from './checkoutLeads.ts';
import { pruneVisits } from './visits.ts';
import { collectDailyReport, reportHtml, rp, signed } from '../marketing/reportPdf.ts';
import { htmlToJpegs, htmlToPdf, sendTelegramDocument, sendTelegramPhotos } from '../marketing/reportDelivery.ts';
import { productStoryHtml, storiesCaption, storiesForWeek, storyWeek, testimonialStoryHtml } from '../marketing/resellerStories.ts';
import { listCollabs } from './collabs.ts';
import { instagramConfigured, publishDuePosts, type InstagramEnv } from '../marketing/instagram.ts';
import { collabCommissionMessage, collabCommissions } from './collab-report.ts';
import { affiliateCommissionMessage, affiliateCommissions, listAffiliates } from './affiliates.ts';
import { dailyReorderContacts, dailyReorderText } from '../marketing/reorder.ts';

function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });
  if (level === 'error') console.error(line);
  else console.log(line);
}

/** Must match the daily entry in wrangler.jsonc "triggers": 12:00 UTC = 19:00 WIB. */
export const DAILY_SUMMARY_CRON = '0 12 * * *';

/** Must match the Sunday entry in wrangler.jsonc "triggers": Sunday 05:00 UTC = Sunday 12:00 WIB. */
export const WEEKLY_RECAP_CRON = '0 5 * * SUN';

/** Must match the monthly entry in wrangler.jsonc "triggers": 01:00 UTC on the 1st = 08:00 WIB on the 1st. */
export const MONTHLY_PROFIT_CRON = '0 1 1 * *';

const telegramFetch = (url: string, init: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) });

type JobEnv = ShopEnv & TelegramEnv & MetaEnv & MetaAdsEnv & InstagramEnv & { DB?: D1Database; BROWSER?: Parameters<typeof htmlToPdf>[0] };

const failMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const reportOpts = { fetchFn: telegramFetch, log };

/** A once-per-period job: retried on the next 15-minute runs (3 tries in total), then reported (see retry.ts). */
interface PeriodSpec {
  name: string;
  what: string;
  period: (now: number) => string;
  work: (env: JobEnv & { DB: D1Database }, ctx: JobContext, now: number) => Promise<void>;
}

/** 19:00 WIB: Telegram message per order to deliver tomorrow, then the unpaid list. */
const DAILY_SUMMARY: PeriodSpec = {
  name: 'daily-summary',
  what: 'Telegram delivery list for tomorrow (19:00, Shipping bot)',
  period: jakartaDateKey,
  work: async (env, ctx, now) => {
    // A retry continues after the bubbles that already went out.
    const sent = await sendDailySummary(env, telegramFetch, now, 1000, { skip: ctx.progress, onSent: ctx.advance });
    log('info', 'telegram_daily_summary', { sent, attempt: ctx.attempt });
  },
};

/** Sunday 12:00 WIB: total boxes x Rp 5.000 per parent reseller for this Monday–Sunday week. */
const PARENT_RECAP: PeriodSpec = {
  name: 'parent-recap',
  what: 'Sunday parent reseller recap (Reporting bot)',
  period: jakartaDateKey,
  work: async (env, ctx, now) => {
    const sent = await sendParentRecap(env, telegramFetch, now);
    log('info', 'telegram_parent_recap', { sent, attempt: ctx.attempt });
  },
};

/** Sunday 12:00 WIB: email to the owner with each reseller's reward progress and a WhatsApp button. */
const RESELLER_RECAP_EMAIL: PeriodSpec = {
  name: 'reseller-recap-email',
  what: 'Sunday reseller reward recap email',
  period: jakartaDateKey,
  work: async (env, ctx) => {
    if (!env.OWNER_EMAIL) return;
    const recap = await resellerRewardRecap(env.DB);
    const sent = await sendEmailsOrThrow(env, env.DB, [resellerRecapEmail(env.OWNER_EMAIL, recap, emailLinksFromEnv(env))], log);
    log('info', 'reseller_recap_email', { resellers: recap.resellers.length, sent, attempt: ctx.attempt });
  },
};

/** Sunday 12:00 WIB (CMO bot): what to transfer to each influencer (Website → Collabs). Nothing when no one sold. */
const COLLAB_COMMISSION: PeriodSpec = {
  name: 'collab-commission',
  what: 'Sunday influencer + affiliate commission recap (CMO bot)',
  period: jakartaDateKey,
  work: async (env, ctx, now) => {
    if (!telegramConfigured(env, 'cmo')) return;
    const collabs = await listCollabs(env.DB);
    const text = collabCommissionMessage(await collabCommissions(env.DB, collabs, now), collabs, emailLinksFromEnv(env).adminUrl);
    // Affiliates (Website → Affiliates) in a second message, same time and bot.
    const affiliates = await listAffiliates(env.DB);
    const affiliateText = affiliateCommissionMessage(await affiliateCommissions(env.DB, affiliates, now), affiliates, emailLinksFromEnv(env).adminUrl);
    const texts = [text, affiliateText].filter((t): t is string => Boolean(t));
    const sent = texts.length ? await sendTelegramMessages(env, 'cmo', texts, telegramFetch) : 0;
    log('info', 'collab_commission_recap', { sent, attempt: ctx.attempt });
  },
};

/** 1st of the month, 08:00 WIB: email to the owner with last month's profit. */
const MONTHLY_PROFIT: PeriodSpec = {
  name: 'monthly-profit-email',
  what: 'Monthly profit email (1st of the month)',
  period: monthKeyOf,
  work: async (env, ctx, now) => {
    if (!env.OWNER_EMAIL) return;
    const month = addMonths(monthKeyOf(now), -1);
    const profit = await monthlyProfit(env.DB, month);
    const sent = await sendEmailsOrThrow(env, env.DB, [monthlyProfitEmail(env.OWNER_EMAIL, profit, emailLinksFromEnv(env))], log);
    log('info', 'monthly_profit_email', { month, orders: profit.orders, sent, attempt: ctx.attempt });
  },
};

/** From 09:00 WIB (CMO bot): WhatsApp reorder links for website customers delivered 14 / 30 days ago (owner, 2026-11-11). */
const REORDER_REMINDERS: PeriodSpec = {
  name: 'reorder-reminders',
  what: 'Daily WhatsApp reorder reminder links (09:00, CMO bot)',
  period: jakartaDateKey,
  work: async (env, ctx, now) => {
    if (!telegramConfigured(env, 'cmo')) return;
    const text = dailyReorderText(await dailyReorderContacts(env.DB, now));
    const sent = text ? await sendTelegramMessages(env, 'cmo', [text], telegramFetch) : 0;
    log('info', 'reorder_reminders', { sent, attempt: ctx.attempt });
  },
};
export const REORDER_HOUR_WIB = 9;

/** Friday from 09:00 WIB (CMO bot): 2 status pictures for resellers, 1 product + 1 testimonial (owner, 2026-11-16). */
const RESELLER_STORIES: PeriodSpec = {
  name: 'reseller-stories',
  what: 'Friday reseller story pictures (CMO bot)',
  period: jakartaDateKey,
  work: async (env, ctx, now) => {
    if (!telegramConfigured(env, 'cmo')) return;
    if (!env.BROWSER) throw new Error('Browser Rendering (BROWSER binding) is missing');
    const week = storyWeek(now);
    const s = storiesForWeek(week);
    const base = `${env.SHOP_URL || 'https://jentiskitchen.id'}/shop/status`;
    const [product, testimonial] = await htmlToJpegs(env.BROWSER, [productStoryHtml(base, s.product, s.theme), testimonialStoryHtml(base, s.testimonial, s.theme)], 1080, 1920);
    const day = jakartaDateKey(now);
    await withRetry(async () => {
      const ok = await sendTelegramPhotos(
        env,
        'cmo',
        [
          { file: product, filename: `status-produk-${day}.jpg` },
          { file: testimonial, filename: `status-testimoni-${day}.jpg` },
        ],
        storiesCaption(week, formatDayKey(day)),
        telegramFetch,
      );
      if (!ok) throw new Error('Telegram refused the pictures (sendMediaGroup)');
    });
    log('info', 'reseller_stories', { week, attempt: ctx.attempt });
  },
};
export const RESELLER_STORIES_HOUR_WIB = 9;

const PERIOD_JOBS = [DAILY_SUMMARY, PARENT_RECAP, RESELLER_RECAP_EMAIL, COLLAB_COMMISSION, MONTHLY_PROFIT, RESELLER_STORIES];

async function runSpec(env: JobEnv, spec: PeriodSpec, now: number, retry: boolean): Promise<void> {
  if (!env.DB) return;
  const db = env.DB;
  try {
    const outcome = await runPeriodJob(
      { ...env, DB: db },
      { name: spec.name, what: spec.what, period: spec.period(now) },
      (ctx) => spec.work({ ...env, DB: db }, ctx, now),
      { now, retry, ...reportOpts },
    );
    if (outcome !== 'skipped') log(outcome === 'done' ? 'info' : 'warn', 'scheduled_job', { job: spec.name, outcome });
  } catch (error) {
    log('error', `${spec.name}_state_failed`, { message: failMessage(error) });
  }
}

export const runDailyTelegramSummary = (env: JobEnv, now = Date.now()) => runSpec(env, DAILY_SUMMARY, now, false);
export const runWeeklyParentRecap = (env: JobEnv, now = Date.now()) => runSpec(env, PARENT_RECAP, now, false);
export const runWeeklyResellerRecapEmail = (env: JobEnv, now = Date.now()) => runSpec(env, RESELLER_RECAP_EMAIL, now, false);
export const runWeeklyCollabCommission = (env: JobEnv, now = Date.now()) => runSpec(env, COLLAB_COMMISSION, now, false);
export const runMonthlyProfitEmail = (env: JobEnv, now = Date.now()) => runSpec(env, MONTHLY_PROFIT, now, false);

/** Every 15 minutes: the next try of a daily/weekly/monthly job whose last try failed (nothing else). */
async function retryPendingJobs(env: JobEnv, now: number): Promise<void> {
  for (const spec of PERIOD_JOBS) await runSpec(env, spec, now, true);
}

/** Every 15 minutes. These checks retry by themselves on the next run; 3 failures in a row are reported. */
export async function runScheduledShopJobs(env: JobEnv): Promise<void> {
  if (!env.DB) return;
  const now = Date.now();
  await retryPendingJobs(env, now);
  try {
    await checkLowStock({ ...env, DB: env.DB }, telegramFetch, log);
    await trackRecurring(env, LOW_STOCK, null, reportOpts);
  } catch (error) {
    log('error', 'telegram_low_stock_failed', { message: failMessage(error) });
    await trackRecurring(env, LOW_STOCK, error, reportOpts);
  }
  await expirePayments(env, env.DB);
  await alertUnpaid(env, env.DB);
  await resendPaidEmails(env, env.DB);
  // Meta ad results (read-only), at most every 6 hours.
  const metaFetch = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const sync = await syncMetaAds(env.DB, env, metaFetch, log);
  if (sync.synced || sync.error) await trackRecurring(env, META_SYNC, sync.error ? new Error(sync.error) : null, reportOpts);
  await sendDailyMarketingReport(env, env.DB, metaFetch);
  await sendResellerAnnouncements(env, env.DB);
  await sendStampAlerts(env, env.DB);
  await publishInstagramPosts(env, env.DB);
  const wib = new Date(now + 7 * 3600 * 1000);
  if (wib.getUTCHours() >= REORDER_HOUR_WIB) await runSpec(env, REORDER_REMINDERS, now, false);
  if (wib.getUTCDay() === 5 && wib.getUTCHours() >= RESELLER_STORIES_HOUR_WIB) await runSpec(env, RESELLER_STORIES, now, false);
}

/** Reporting bot: a reseller filled a stamp level (jentiskitchen.id/stamp). */
async function sendStampAlerts(env: JobEnv, db: D1Database): Promise<void> {
  if (!telegramConfigured(env, 'reporting')) return;
  try {
    const sent = await checkStampMilestones(db, (texts) => sendTelegramMessages(env, 'reporting', texts, telegramFetch), Date.now());
    if (sent) log('info', 'stamp_alerts_sent', { sent });
  } catch (error) {
    log('error', 'stamp_alerts_failed', { message: error instanceof Error ? error.message : String(error) });
  }
}

const INSTAGRAM = { name: 'instagram-post', what: 'Automatic Instagram post (@jentis.kitchen)' };

/** Queued Instagram posts that are due (instagram.ts); the CMO bot gets the link of each new post. */
async function publishInstagramPosts(env: JobEnv, db: D1Database): Promise<void> {
  if (!instagramConfigured(env)) return;
  try {
    const igFetch = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
    const results = await publishDuePosts(db, env, igFetch, Date.now());
    for (const r of results) {
      if (r.ok) {
        log('info', 'instagram_posted', { id: r.id });
        if (telegramConfigured(env, 'cmo'))
          await sendTelegramMessages(env, 'cmo', [`📸 Posted on Instagram (${r.id})${r.permalink ? `\n${r.permalink}` : ''}`], telegramFetch).catch(() => {});
      } else {
        log('error', 'instagram_post_failed', { id: r.id, message: r.error });
        if (r.gaveUp) await reportFailure(env, { job: INSTAGRAM.name, what: `${INSTAGRAM.what}: ${r.id}`, error: r.error ?? 'unknown' }, reportOpts);
      }
    }
  } catch (error) {
    log('error', 'instagram_post_failed', { message: failMessage(error) });
  }
}

const LOW_STOCK = { name: 'low-stock-check', what: 'Low stock check (Stock Alert bot)' };
const PAYMENT_EXPIRY = { name: 'payment-expiry', what: 'Checking unpaid website orders with the payment gateway' };
const UNPAID_ALERT = { name: 'unpaid-alert', what: 'Unpaid website order alert (Incoming Order bot)' };
const META_SYNC = { name: 'meta-ads-sync', what: 'Reading ad results from Meta' };
const ANNOUNCEMENTS = { name: 'reseller-announcement', what: 'Reseller announcement email' };

/** Reseller announcements still waiting to be emailed to the owner (My Resellers → Announcement), 3 tries each. */
async function sendResellerAnnouncements(env: JobEnv, db: D1Database): Promise<void> {
  if (!env.OWNER_EMAIL) return;
  try {
    const owner = env.OWNER_EMAIL;
    let lastError: unknown = null;
    const send = async (emails: Parameters<typeof sendEmailsQuietly>[2]) => {
      const r = await sendEmailsQuietly(env, db, emails, log);
      if (r.failed) lastError = r.error;
      return r.sent;
    };
    const { done, gaveUp } = await emailPendingAnnouncements(db, owner, send, emailLinksFromEnv(env).adminUrl, Date.now());
    if (done) log('info', 'reseller_announcement_emailed', { announcements: done });
    if (gaveUp.length) await reportFailure(env, { job: ANNOUNCEMENTS.name, what: ANNOUNCEMENTS.what, error: lastError ?? 'no email went out' }, reportOpts);
    await trackRecurring(env, ANNOUNCEMENTS, null, reportOpts);
  } catch (error) {
    log('error', 'reseller_announcement_failed', { message: failMessage(error) });
    await trackRecurring(env, ANNOUNCEMENTS, error, reportOpts);
  }
}

const CMO_REPORT = { name: 'cmo-daily-report', what: 'Daily marketing report (CMO bot, 07:00)' };

/**
 * 07:00 WIB (first 15-minute run after it): yesterday's ads + real orders + profit after ads, on the CMO bot.
 * One try per 15-minute run: the PDF first; when it failed on the 3rd try, the text version instead.
 */
async function sendDailyMarketingReport(env: JobEnv, db: D1Database, metaFetch: (url: string, init?: RequestInit) => Promise<Response>): Promise<void> {
  try {
    const now = Date.now();
    if (!telegramConfigured(env, 'cmo') || !(await reportDue(db, now))) return;
    const outcome = await runPeriodJob(
      { ...env, DB: db },
      { ...CMO_REPORT, period: jakartaDateKey(now) },
      async (ctx) => {
        await syncMetaAds(db, env, metaFetch, log, now, true); // final numbers for yesterday
        const state = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(SYNC_STATE_KEY).first<{ value: string }>();
        const lastSync = state ? Number(JSON.parse(state.value).lastSuccess ?? 0) || null : null;
        // PDF (one page, designed) with a 2-line caption; the long text report only as a fallback.
        let pdfError: unknown = null;
        if (env.BROWSER) {
          try {
            const data = await collectDailyReport(db, now, lastSync);
            const pdf = await htmlToPdf(env.BROWSER, reportHtml(data, `${env.SHOP_URL || 'https://jentiskitchen.id'}/shop/brand/logo.png`));
            const yAfter = data.yesterday.profit === null ? null : data.yesterday.profit - data.yesterday.spend;
            const tAfter = data.total.profit === null ? null : data.total.profit - data.total.spend;
            // One line per campaign that spent or brought an order: spend, orders, profit after its ads.
            const campaigns = data.channels
              .filter((c) => c.spend || c.orders.length)
              .map((c) => `• ${c.channel.name.replace(/^(Meta|Google) · /, '')}: ${rp(c.spend)} ads · ${c.orders.length} order${c.orders.length === 1 ? '' : 's'}${c.profit === null ? '' : ` · ${signed(c.profit - c.spend)}`}`);
            const caption = [
              `📊 Daily marketing report — ${data.day}`,
              `Yesterday: ${data.orders.length} paid orders · ${rp(data.yesterday.revenue)} · profit after ads ${yAfter === null ? '?' : signed(yAfter)}`,
              ...campaigns,
              tAfter === null ? '' : `Since ${data.since}: profit after ads ${signed(tAfter)}`,
              data.questions.length ? `❓ ${data.questions.length} question(s) for you inside` : '✅ Nothing needs your decision today',
            ].filter(Boolean).join('\n');
            await withRetry(async () => {
              if (!(await sendTelegramDocument(env, 'cmo', pdf, `Jentis-Marketing-Report-${data.day}.pdf`, caption, telegramFetch))) {
                throw new Error('Telegram refused the PDF (sendDocument)');
              }
            });
            log('info', 'cmo_daily_report', { pdf: true, attempt: ctx.attempt });
            return;
          } catch (error) {
            const message = failMessage(error);
            log('error', 'cmo_daily_report_pdf_failed', { message, attempt: ctx.attempt });
            // Kept in the database so the reason can be read later (Worker logs are not always reachable).
            await db
              .prepare(
                `INSERT INTO notification_state (key, value, updatedAt) VALUES ('cmo:pdf-error', ?, ?)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
              )
              .bind(JSON.stringify({ message: message.slice(0, 500), at: now, attempt: ctx.attempt }), now)
              .run();
            if (!ctx.final) throw error; // try the PDF again on the next 15-minute run
            pdfError = error;
          }
        }
        await sendTelegramMessages(env, 'cmo', [await buildDailyReport(db, now, lastSync)], telegramFetch, 0);
        log('info', 'cmo_daily_report', { pdf: false, attempt: ctx.attempt });
        if (pdfError) {
          await reportFailure(
            env,
            { job: 'cmo-daily-report-pdf', what: 'Daily marketing report as PDF', error: pdfError, note: `The PDF failed ${MAX_ATTEMPTS} times, so the text version was sent instead.` },
            reportOpts,
          );
        }
      },
      { now, ...reportOpts },
    );
    if (outcome === 'done' || outcome === 'gave-up') {
      await markReportSent(db, now);
      await pruneVisits(db, now); // keep 180 days of visit_events
      await pruneCheckoutLeads(db, now);
    }
  } catch (error) {
    log('error', 'cmo_daily_report_failed', { message: failMessage(error) });
  }
}

/**
 * Manual resend queue: a notification_state row with key "resend:paid:<orderRowId>" (paid emails) or
 * "resend:meta:<orderRowId>" (Meta Purchase), added by hand in D1, makes the next 15-minute run send it again, once. The row is removed before sending, so it never repeats.
 */
export async function resendPaidEmails(env: JobEnv, db: D1Database): Promise<number> {
  try {
    const { results } = await db
      .prepare("SELECT key FROM notification_state WHERE key LIKE 'resend:paid:%' OR key LIKE 'resend:meta:%' LIMIT 5")
      .all<{ key: string }>();
    let sent = 0;
    for (const { key } of results) {
      const removed = await db.prepare('DELETE FROM notification_state WHERE key = ?').bind(key).run();
      if (!removed.meta?.changes) continue; // another run took it
      if (key.startsWith('resend:meta:')) {
        const meta = metaPurchaseNotifier(env, telegramFetch, log);
        if (meta && (await metaPurchaseAgain(db, key.slice('resend:meta:'.length), meta))) sent++;
        log('info', 'shop_meta_purchase_resent', {});
        continue;
      }
      const emails = await paidEmailsAgain(db, key.slice('resend:paid:'.length), env.OWNER_EMAIL || null, emailLinksFromEnv(env));
      sent += await sendEmailsWith(env, db, emails, log);
      log('info', 'shop_paid_emails_resent', { emails: emails.length });
    }
    return sent;
  } catch (error) {
    log('error', 'shop_paid_emails_resend_failed', { message: failMessage(error) });
    return 0;
  }
}

/** Telegram (Incoming Order bot): website orders still unpaid 15 minutes after they were placed, once each. */
async function alertUnpaid(env: JobEnv, db: D1Database): Promise<void> {
  if (!telegramConfigured(env, 'orders')) return;
  try {
    const alerted = await alertUnpaidOrders(db, emailLinksFromEnv(env), Date.now(), telegramNotifier(env, 'orders', telegramFetch, log));
    if (alerted.length) log('info', 'telegram_unpaid_alert', { orders: alerted.length });
    await checkoutLeadsAlert(db, emailLinksFromEnv(env).adminUrl, Date.now(), telegramNotifier(env, 'orders', telegramFetch, log));
    await trackRecurring(env, UNPAID_ALERT, null, reportOpts);
  } catch (error) {
    log('error', 'telegram_unpaid_alert_failed', { message: failMessage(error) });
    await trackRecurring(env, UNPAID_ALERT, error, reportOpts);
  }
}

/** Must match the every-minute entry in wrangler.jsonc "triggers". */
export const OVO_EXPIRY_CRON = '* * * * *';

/** Every minute: cancels OVO orders whose short payment window closed. Nothing else runs while no OVO order is unpaid. */
export async function runOvoExpiry(env: JobEnv): Promise<void> {
  if (!env.DB) return;
  const open = await env.DB.prepare(
    `SELECT 1 FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
     WHERE s.paymentMethod = 'OVO' AND o.orderStatus = 'ACTIVE' AND o.paymentStatus = 'PENDING' LIMIT 1`,
  ).first();
  if (open) await expirePayments(env, env.DB);
}

async function expirePayments(env: JobEnv, db: D1Database): Promise<void> {
  const gateways = paymentGatewaysFromEnv(env, (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(8000) }));
  if (!gateways.length) return; // without online payment there is no deadline (manual transfers can take longer)
  try {
    const result = await expireUnpaidOrders(
      db,
      gateways,
      emailLinksFromEnv(env),
      env.OWNER_EMAIL || null,
      Date.now(),
      telegramNotifier(env, 'orders', telegramFetch, log),
      metaPurchaseNotifier(env, telegramFetch, log),
    );
    if (result.cancelled.length || result.paid.length || result.failed.length) {
      log(result.failed.length ? 'warn' : 'info', 'shop_expire_unpaid', {
        cancelled: result.cancelled.length,
        paidLate: result.paid.length,
        failed: result.failed,
      });
    }
    await sendEmailsWith(env, db, result.emails, log);
    // An order the gateway could not be asked about stays as it is and is checked again on the next run.
    const failed = result.failed.length
      ? new Error(`${result.failed.length} order(s) could not be checked: ${result.failed[0].message}`)
      : null;
    await trackRecurring(env, PAYMENT_EXPIRY, failed, reportOpts);
  } catch (error) {
    log('error', 'shop_expire_unpaid_failed', { message: failMessage(error) });
    await trackRecurring(env, PAYMENT_EXPIRY, error, reportOpts);
  }
}
