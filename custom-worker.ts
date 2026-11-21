// Worker entry point: the Next.js app built by OpenNext (`fetch`) plus the scheduled jobs (`scheduled`).
// See https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js';
import {
  runOvoExpiry,
  runScheduledShopJobs,
  runDailyTelegramSummary,
  runWeeklyCollabCommission,
  runWeeklyParentRecap,
  runWeeklyResellerRecapEmail,
  runMonthlyProfitEmail,
  DAILY_SUMMARY_CRON,
  MONTHLY_PROFIT_CRON,
  OVO_EXPIRY_CRON,
  WEEKLY_RECAP_CRON,
} from './src/lib/shop/scheduled.ts';

type Env = Parameters<typeof runScheduledShopJobs>[0];

export default {
  fetch: handler.fetch,

  // Cron Triggers (wrangler.jsonc "triggers"):
  //   every minute: cancel OVO orders whose short payment window closed
  //   every 15 minutes: cancel website orders whose payment expired + Telegram alert for stock below 5
  //   12:00 UTC = 19:00 WIB: Telegram summary of tomorrow's deliveries
  //   Sunday 05:00 UTC = Sunday 12:00 WIB: Telegram recap of what to transfer to each parent reseller
  //     + email to the owner with each reseller's reward progress and WhatsApp buttons
  //   01:00 UTC on the 1st = 08:00 WIB on the 1st: email to the owner with last month's profit
  async scheduled(controller: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    if (controller.cron === OVO_EXPIRY_CRON) ctx.waitUntil(runOvoExpiry(env));
    else if (controller.cron === DAILY_SUMMARY_CRON) ctx.waitUntil(runDailyTelegramSummary(env));
    else if (controller.cron === WEEKLY_RECAP_CRON) {
      ctx.waitUntil(runWeeklyParentRecap(env));
      ctx.waitUntil(runWeeklyResellerRecapEmail(env));
      ctx.waitUntil(runWeeklyCollabCommission(env));
    }
    else if (controller.cron === MONTHLY_PROFIT_CRON) ctx.waitUntil(runMonthlyProfitEmail(env));
    else ctx.waitUntil(runScheduledShopJobs(env));
  },
};
