// Sends shop emails through Resend. Framework-free, so both the website and the scheduled job can use it.
import type { D1Database } from '../core/d1.ts';
import type { Email } from './email.ts';
import { markCampaignCodeEmailed } from './campaigns.ts';
import { markVoucherEmailed } from './vouchers.ts';
import { reportFailure, RetryAfterError, withRetry, type ReportEnv } from '../notify/retry.ts';

export interface MailerEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

type Log = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;

/** Sends one email with up to 3 tries; false when no provider is set up. Throws when it still failed. */
async function sendOne(env: MailerEnv, email: Email, log: Log): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    // Local development and not-yet-configured environments: the email is only written to the log.
    log('info', 'email_not_sent_no_provider', { to: email.to, subject: email.subject });
    return false;
  }
  await withRetry(async () => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Jentis Kitchen <order@jentiskitchen.id>',
        to: [email.to],
        subject: email.subject,
        html: email.html,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) return;
    const body = (await response.text()).slice(0, 300);
    log('warn', 'email_try_failed', { to: email.to, subject: email.subject, status: response.status, body });
    // Rate limit (bulk sends such as voucher emails): wait a moment before the next try.
    if (response.status === 429) throw new RetryAfterError(`Resend ${response.status}: ${body}`, 1100);
    throw new Error(`Resend ${response.status}: ${body}`);
  });
  log('info', 'email_sent', { to: email.to, subject: email.subject });
  return true;
}

/** Sends every email (3 tries each) and says how many went out or failed. Never throws, never reports. */
export async function sendEmailsQuietly(env: MailerEnv, db: D1Database, emails: Email[], log: Log): Promise<{ sent: number; failed: number; error?: unknown }> {
  let sent = 0;
  let failed = 0;
  let error: unknown;
  for (const email of emails) {
    try {
      if (await sendOne(env, email, log)) {
        sent++;
        if (email.voucherId) await markVoucherEmailed(db, email.voucherId, Date.now());
        if (email.campaignCodeId) await markCampaignCodeEmailed(db, email.campaignCodeId, Date.now());
      }
    } catch (e) {
      failed++;
      error = e;
      log('error', 'email_failed', { to: email.to, subject: email.subject, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { sent, failed, error };
}

/**
 * Sends emails one by one (3 tries each); vouchers are marked as emailed only when their email went out. Never
 * throws: emails that still fail are reported once a day on the Reporting bot (no addresses or subjects in it).
 */
export async function sendEmailsWith(env: MailerEnv & ReportEnv, db: D1Database, emails: Email[], log: Log): Promise<number> {
  const { sent, failed, error } = await sendEmailsQuietly(env, db, emails, log);
  if (failed) {
    await reportFailure(
      { ...env, DB: db },
      { job: 'email', what: `Email to a customer or the owner (${failed} of ${emails.length} not sent)`, error },
      { log },
    );
  }
  return sent;
}

/** Same, for scheduled jobs that retry on their own: throws when any email failed, without reporting. */
export async function sendEmailsOrThrow(env: MailerEnv, db: D1Database, emails: Email[], log: Log): Promise<number> {
  const { sent, failed, error } = await sendEmailsQuietly(env, db, emails, log);
  if (failed) throw error;
  return sent;
}
