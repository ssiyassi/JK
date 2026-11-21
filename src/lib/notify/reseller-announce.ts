// Announcements to every reseller: the owner writes one message on My Resellers and receives it by email as one
// WhatsApp button per reseller, message filled in. Framework-free: also run by the 15-minute job (custom-worker.ts),
// which emails any announcement still waiting (for example one added straight into the database).
import { AppError, newId, type D1Database } from '../core/d1.ts';
import type { Email } from '../shop/email.ts';
import { resellerAnnouncementEmails } from '../shop/email.ts';

export interface AnnouncementReseller {
  reseller: string;
  parentReseller: string | null;
  phone: string | null;
}

export const MAX_ANNOUNCEMENT = 3000;

/** The message for one reseller: {{reseller name}} / {{nama}} becomes the name. */
export function announcementText(message: string, resellerName: string): string {
  return message.replace(/\{\{\s*(reseller name|reseller|nama)\s*\}\}/gi, resellerName);
}

export async function announcementResellers(db: D1Database): Promise<AnnouncementReseller[]> {
  const { results } = await db
    .prepare('SELECT reseller, parentReseller, phone FROM resellers ORDER BY reseller COLLATE NOCASE, parentReseller')
    .all<AnnouncementReseller>();
  return results.map((r) => ({ reseller: String(r.reseller), parentReseller: r.parentReseller ?? null, phone: r.phone ?? null }));
}

/** Saves a new announcement, already claimed (emailedAt set) when it is sent right away. */
export async function createAnnouncement(db: D1Database, message: unknown, now: number, claimed: boolean): Promise<{ id: string; message: string }> {
  const text = typeof message === 'string' ? message.replace(/\r\n/g, '\n').trim() : '';
  if (!text) throw new AppError(400, 'Please write the message');
  if (text.length > MAX_ANNOUNCEMENT) throw new AppError(400, `The message is too long (max ${MAX_ANNOUNCEMENT} characters)`);
  const id = newId();
  await db
    .prepare('INSERT INTO reseller_announcements (id, message, createdAt, emailedAt) VALUES (?, ?, ?, ?)')
    .bind(id, text, now, claimed ? now : null)
    .run();
  return { id, message: text };
}

/** Builds and sends the emails; when none went out, the announcement is released so the 15-minute job tries again. */
export async function emailAnnouncement(
  db: D1Database,
  a: { id: string; message: string },
  to: string,
  send: (emails: Email[]) => Promise<number>,
  adminUrl: string,
): Promise<{ emails: number; sent: number; resellers: number }> {
  const resellers = await announcementResellers(db);
  const emails = resellerAnnouncementEmails(to, a.message, resellers, adminUrl);
  const sent = emails.length ? await send(emails) : 0;
  if (!sent) await db.prepare('UPDATE reseller_announcements SET emailedAt = NULL WHERE id = ?').bind(a.id).run();
  return { emails: emails.length, sent, resellers: resellers.length };
}

/** Tries per announcement before it is given up (and reported). */
export const ANNOUNCEMENT_ATTEMPTS = 3;

/**
 * 15-minute job: emails every announcement still waiting. Each is claimed first, so it is never emailed twice.
 * One that sent nothing is tried again on the next runs, at most ANNOUNCEMENT_ATTEMPTS times; then it stays marked
 * (given up) and is returned in `gaveUp`.
 */
export async function emailPendingAnnouncements(
  db: D1Database,
  to: string,
  send: (emails: Email[]) => Promise<number>,
  adminUrl: string,
  now: number,
): Promise<{ done: number; gaveUp: string[] }> {
  const { results } = await db
    .prepare('SELECT id, message FROM reseller_announcements WHERE emailedAt IS NULL ORDER BY createdAt LIMIT 3')
    .all<{ id: string; message: string }>();
  let done = 0;
  const gaveUp: string[] = [];
  for (const a of results) {
    const claim = await db.prepare('UPDATE reseller_announcements SET emailedAt = ? WHERE id = ? AND emailedAt IS NULL').bind(now, a.id).run();
    if (!claim.meta.changes) continue;
    const r = await emailAnnouncement(db, a, to, send, adminUrl);
    const key = `announce:attempts:${a.id}`;
    if (r.sent) {
      done++;
      await db.prepare('DELETE FROM notification_state WHERE key = ?').bind(key).run();
      continue;
    }
    if (!r.emails) continue;
    const row = await db.prepare('SELECT value FROM notification_state WHERE key = ?').bind(key).first<{ value: string }>();
    const attempts = Number(row?.value ?? 0) + 1;
    await db
      .prepare(
        `INSERT INTO notification_state (key, value, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
      )
      .bind(key, String(attempts), now)
      .run();
    if (attempts >= ANNOUNCEMENT_ATTEMPTS) {
      await db.prepare('UPDATE reseller_announcements SET emailedAt = ? WHERE id = ?').bind(now, a.id).run();
      gaveUp.push(a.id);
    }
  }
  return { done, gaveUp };
}
