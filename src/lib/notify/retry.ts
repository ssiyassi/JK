// Retries for everything that runs on its own (cron jobs, Telegram, email, Meta), and one error report on the
// "Jentis Reporting" Telegram bot when something still fails after 3 tries. Framework-free (tests/retry.test.ts).
//
// Three shapes:
//   withRetry        quick calls (one HTTP request): up to 3 tries in the same run, 1 s and 3 s apart.
//   runPeriodJob     once-a-day/week/month jobs: one try per 15-minute run, at most 3, never twice once it worked.
//   trackRecurring   checks that already run every 15 minutes (stock, expiry, ...): report after 3 failures in a row.
// State lives in notification_state (keys "job:<name>" and "alert:<name>:<day>").
import type { D1Database } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';
import { sendTelegramMessages, telegramConfigured, type FetchFn, type TelegramEnv } from './telegram.ts';

export const MAX_ATTEMPTS = 3;

/** Waits between in-run tries; tests set them to 0. */
export const retryTiming = { delaysMs: [1000, 3000] };

/** A failure that says how long to wait first (Telegram 429 "retry_after"). */
export class RetryAfterError extends Error {
  retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

/** Runs `work` up to `attempts` times; returns its result or throws the last error. */
export async function withRetry<T>(work: (attempt: number) => Promise<T>, attempts = MAX_ATTEMPTS): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await work(attempt);
    } catch (error) {
      last = error;
      if (attempt === attempts) break;
      const { delaysMs } = retryTiming;
      const wait = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
      await sleep(error instanceof RetryAfterError && delaysMs.some(Boolean) ? Math.max(wait, error.retryAfterMs) : wait);
    }
  }
  throw last;
}

/** The error as short text without secrets or contact details (bot tokens, access tokens, emails, phone numbers). */
export function errorText(error: unknown, max = 300): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/bot\d+:[\w-]+/g, 'bot***')
    .replace(/(access_token|token|key|secret|signature)=[^&\s"]+/gi, '$1=***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

type Log = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;
export type ReportEnv = TelegramEnv & { DB?: D1Database };

const defaultFetch: FetchFn = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
const defaultLog: Log = (level, event, data = {}) => {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });
  if (level === 'error') console.error(line);
  else console.log(line);
};

export interface FailureReport {
  /** Short id, also the de-duplication key: one report per job per Jakarta day. */
  job: string;
  /** Plain words for the owner, e.g. "Telegram delivery list (19:00)". */
  what: string;
  error: unknown;
  /** Last line of the message; default: tried 3 times, then gave up. */
  note?: string;
}

export function failureMessage(report: FailureReport, now: number): string {
  const when = new Date(now).toLocaleString('en-GB', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return [
    `⚠️ Automatic job failed: ${report.what}`,
    '',
    `When: ${when} WIB`,
    `Error: ${errorText(report.error) || 'unknown error'}`,
    '',
    report.note ?? `Tried ${MAX_ATTEMPTS} times, then gave up. Nothing more is sent for this today.`,
  ].join('\n');
}

/**
 * One message on the Reporting bot, at most once per job per Jakarta day. Never throws: when the report itself
 * fails, it is only logged.
 */
export async function reportFailure(env: ReportEnv, report: FailureReport, opts: { now?: number; fetchFn?: FetchFn; log?: Log } = {}): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const log = opts.log ?? defaultLog;
  log('error', 'job_gave_up', { job: report.job, message: errorText(report.error) });
  if (!telegramConfigured(env, 'reporting')) return false;
  try {
    if (env.DB) {
      const claim = await env.DB
        .prepare(`INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING`)
        .bind(`alert:${report.job}:${jakartaDateKey(now)}`, errorText(report.error), now)
        .run();
      if (!claim.meta.changes) return false; // already reported today
    }
    // One try only: a failing Reporting bot must not hold up the job behind it.
    await sendTelegramMessages(env, 'reporting', [failureMessage(report, now)], opts.fetchFn ?? defaultFetch, 0, { attempts: 1 });
    return true;
  } catch (error) {
    log('error', 'failure_report_failed', { job: report.job, message: errorText(error) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Job state in notification_state
// ---------------------------------------------------------------------------

interface JobState {
  /** Which day/week/month this state is for (e.g. "2026-10-29"). */
  period?: string;
  status?: 'pending' | 'done' | 'gave-up';
  attempts?: number;
  /** Earliest time a retry may start (keeps the 15-minute run away from a try that is still running). */
  nextAt?: number;
  /** Parts already sent (e.g. Telegram bubbles), so a retry continues instead of sending them again. */
  progress?: number;
  /** Failures in a row (recurring checks). */
  failures?: number;
  error?: string;
}

const jobKey = (name: string) => `job:${name}`;

async function readState(db: D1Database, name: string): Promise<JobState> {
  const row = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(jobKey(name)).first<{ value: string }>();
  try {
    return row ? (JSON.parse(row.value) as JobState) : {};
  } catch {
    return {};
  }
}

async function writeState(db: D1Database, name: string, state: JobState, now: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
    )
    .bind(jobKey(name), JSON.stringify(state), now)
    .run();
}

/** Gap before a retry may start; shorter than 15 minutes so the next run picks it up. */
const RETRY_GAP_MS = 10 * 60 * 1000;

export interface PeriodJob {
  name: string;
  what: string;
  period: string;
}

export interface JobContext {
  attempt: number;
  /** True on the last allowed try. */
  final: boolean;
  /** Parts already sent by earlier tries. */
  progress: number;
  /** Call after each part went out, so a retry skips it. */
  advance: () => Promise<void>;
}

export type JobOutcome = 'done' | 'retry' | 'gave-up' | 'skipped';

/**
 * Once-per-period job: one try per call, at most MAX_ATTEMPTS per period. Done or given up = never run again for
 * that period. Call it from the job's own cron and again from every 15-minute run (`retry: true` only continues a
 * job that already started and failed). After the last failed try, one report goes to the Reporting bot.
 */
export async function runPeriodJob(
  env: ReportEnv & { DB: D1Database },
  job: PeriodJob,
  work: (ctx: JobContext) => Promise<void>,
  opts: { now?: number; retry?: boolean; fetchFn?: FetchFn; log?: Log } = {},
): Promise<JobOutcome> {
  const now = opts.now ?? Date.now();
  const log = opts.log ?? defaultLog;
  const db = env.DB;
  const before = await readState(db, job.name);
  const same = before.period === job.period;
  if (same && before.status !== 'pending') return 'skipped';
  if (same && (before.nextAt ?? 0) > now) return 'skipped';
  if (!same && opts.retry) return 'skipped'; // nothing started for this period yet
  const state: JobState = {
    period: job.period,
    status: 'pending',
    attempts: (same ? before.attempts ?? 0 : 0) + 1,
    progress: same ? before.progress ?? 0 : 0,
    nextAt: now + RETRY_GAP_MS,
  };
  await writeState(db, job.name, state, now);
  const ctx: JobContext = {
    attempt: state.attempts!,
    final: state.attempts! >= MAX_ATTEMPTS,
    progress: state.progress!,
    advance: async () => {
      state.progress = (state.progress ?? 0) + 1;
      await writeState(db, job.name, state, now);
    },
  };
  try {
    await work(ctx);
    await writeState(db, job.name, { period: job.period, status: 'done', attempts: state.attempts }, now);
    return 'done';
  } catch (error) {
    const message = errorText(error, 500);
    log('error', `${job.name}_failed`, { attempt: state.attempts, message });
    if (!ctx.final) {
      await writeState(db, job.name, { ...state, error: message }, now);
      return 'retry';
    }
    await writeState(db, job.name, { ...state, status: 'gave-up', error: message }, now);
    await reportFailure(env, { job: job.name, what: job.what, error }, { now, fetchFn: opts.fetchFn, log });
    return 'gave-up';
  }
}

/**
 * A check that runs every 15 minutes anyway (so it retries by itself): counts failures in a row and sends one
 * report when it reaches MAX_ATTEMPTS. `error` null = this run worked. Never throws.
 */
export async function trackRecurring(
  env: ReportEnv,
  job: { name: string; what: string },
  error: unknown | null,
  opts: { now?: number; fetchFn?: FetchFn; log?: Log } = {},
): Promise<void> {
  const db = env.DB;
  if (!db) return;
  const now = opts.now ?? Date.now();
  const log = opts.log ?? defaultLog;
  try {
    const before = await readState(db, job.name);
    if (error === null) {
      if (before.failures) await writeState(db, job.name, {}, now);
      return;
    }
    const failures = (before.failures ?? 0) + 1;
    await writeState(db, job.name, { failures, error: errorText(error, 500) }, now);
    if (failures === MAX_ATTEMPTS) {
      await reportFailure(
        env,
        { job: job.name, what: job.what, error, note: `Failed ${MAX_ATTEMPTS} times in a row. It keeps trying every 15 minutes.` },
        { now, fetchFn: opts.fetchFn, log },
      );
    }
  } catch (e) {
    log('error', 'job_state_failed', { job: job.name, message: errorText(e) });
  }
}
