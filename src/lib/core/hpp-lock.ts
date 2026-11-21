// Second lock on the HPP & Profit pages (on top of the Cloudflare Access login): a 6-digit code emailed to the
// owner. A correct code unlocks this browser for UNLOCK_HOURS. Only hashes of codes and tokens are stored.
import { AppError, newId, type D1Database } from './d1.ts';
import { randomToken, sha256 } from '../shop/util.ts';

/** Where the code goes (asked for by the owner on 2026-10-17). */
export const HPP_OTP_EMAIL = 'yuwonochaiyadi@gmail.com';
export const HPP_COOKIE = 'jentis_hpp';
export const UNLOCK_HOURS = 12;
const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const MIN_SECONDS_BETWEEN_CODES = 30;
const MAX_CODES_PER_HOUR = 5;

/** "yuwonochaiyadi@gmail.com" -> "yu•••••@gmail.com" (shown on the lock screen). */
export function maskedEmail(email = HPP_OTP_EMAIL): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}•••••@${domain}`;
}

function sixDigits(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

const codeHash = (id: string, code: string) => sha256(`${id}:${code}`);

/** Makes a new code (older unused codes stop working). Returns the code to email. */
export async function createOtp(db: D1Database, now = Date.now()): Promise<string> {
  const recent = await db
    .prepare('SELECT COUNT(*) AS n, MAX(createdAt) AS last FROM hpp_otp_codes WHERE createdAt > ?')
    .bind(now - 3600_000)
    .first<{ n: number; last: number | null }>();
  if (recent?.last && now - Number(recent.last) < MIN_SECONDS_BETWEEN_CODES * 1000) {
    throw new AppError(429, 'A code was just sent. Wait 30 seconds before asking for a new one.');
  }
  if (Number(recent?.n ?? 0) >= MAX_CODES_PER_HOUR) throw new AppError(429, 'Too many codes this hour. Try again later.');
  const id = newId();
  const code = sixDigits();
  await db.batch([
    db.prepare('UPDATE hpp_otp_codes SET usedAt = ? WHERE usedAt IS NULL').bind(now),
    db.prepare('INSERT INTO hpp_otp_codes (id, codeHash, expiresAt, attempts, usedAt, createdAt) VALUES (?, ?, ?, 0, NULL, ?)')
      .bind(id, await codeHash(id, code), now + CODE_MINUTES * 60_000, now),
    db.prepare('DELETE FROM hpp_otp_codes WHERE createdAt < ?').bind(now - 7 * 86400_000),
    db.prepare('DELETE FROM hpp_unlocks WHERE expiresAt < ?').bind(now),
  ]);
  return code;
}

/** Checks a code. Right: returns a new unlock token (for the cookie). Wrong: counts a try. */
export async function verifyOtp(db: D1Database, code: unknown, now = Date.now()): Promise<string> {
  const typed = String(code ?? '').replace(/\D/g, '');
  const row = await db
    .prepare('SELECT id, codeHash, expiresAt, attempts FROM hpp_otp_codes WHERE usedAt IS NULL ORDER BY createdAt DESC LIMIT 1')
    .first<{ id: string; codeHash: string; expiresAt: number; attempts: number }>();
  if (!row || Number(row.expiresAt) < now) throw new AppError(400, 'The code has expired. Ask for a new one.');
  // The try is counted before the code is checked, in one step, so guesses sent at the same time cannot get past 5.
  const counted = await db
    .prepare('UPDATE hpp_otp_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? RETURNING attempts')
    .bind(row.id, MAX_TRIES)
    .first<{ attempts: number }>();
  if (!counted) throw new AppError(400, 'Too many wrong tries. Ask for a new code.');
  if (typed.length !== 6 || (await codeHash(row.id, typed)) !== row.codeHash) {
    const left = MAX_TRIES - Number(counted.attempts);
    throw new AppError(400, left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Wrong code. Ask for a new code.');
  }
  const token = randomToken();
  await db.batch([
    db.prepare('UPDATE hpp_otp_codes SET usedAt = ? WHERE id = ?').bind(now, row.id),
    db.prepare('INSERT INTO hpp_unlocks (tokenHash, expiresAt, createdAt) VALUES (?, ?, ?)').bind(await sha256(token), now + UNLOCK_HOURS * 3600_000, now),
  ]);
  return token;
}

export async function isUnlocked(db: D1Database, token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const row = await db.prepare('SELECT expiresAt FROM hpp_unlocks WHERE tokenHash = ?').bind(await sha256(token)).first<{ expiresAt: number }>();
  return Boolean(row && Number(row.expiresAt) > now);
}

export async function lock(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM hpp_unlocks WHERE tokenHash = ?').bind(await sha256(token)).run();
}
