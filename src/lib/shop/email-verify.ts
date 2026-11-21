// Email confirmation for new customer accounts: a 6-digit code is emailed after sign-up; the welcome voucher is only
// given once the customer typed it (so nobody can collect welcome vouchers with made-up emails). Framework-free.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import type { Customer } from './customers.ts';
import { sha256 } from './util.ts';
import { issueVoucher, type Voucher } from './vouchers.ts';

export const EMAIL_CODE_MINUTES = 15;
const MAX_TRIES = 5;
export const RESEND_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;

function sixDigits(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
}

const codeHash = (id: string, code: string) => sha256(`${id}:${code}`);

/** Seconds until this customer may ask for another code (0 = now). */
export async function secondsUntilResend(db: D1Database, customerId: string, now: number): Promise<number> {
  const row = await db.prepare('SELECT MAX(createdAt) AS last FROM shop_email_codes WHERE customerId = ?').bind(customerId).first<{ last: number | null }>();
  if (!row?.last) return 0;
  return Math.max(0, Math.ceil(RESEND_SECONDS - (now - Number(row.last)) / 1000));
}

/** Makes a new code for this customer (older unused codes stop working). Returns the code to email. */
export async function createEmailCode(db: D1Database, customer: Customer, now: number): Promise<string> {
  if (customer.emailVerifiedAt !== null) throw new AppError(409, 'Email Anda sudah dikonfirmasi.');
  const recent = await db
    .prepare('SELECT COUNT(*) AS n, MAX(createdAt) AS last FROM shop_email_codes WHERE customerId = ? AND createdAt > ?')
    .bind(customer.id, now - 3600_000)
    .first<{ n: number; last: number | null }>();
  if (recent?.last && now - Number(recent.last) < RESEND_SECONDS * 1000) {
    throw new AppError(429, `Kode baru saja dikirim. Tunggu ${RESEND_SECONDS} detik sebelum minta kode lagi.`);
  }
  if (Number(recent?.n ?? 0) >= MAX_CODES_PER_HOUR) throw new AppError(429, 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.');
  const id = newId();
  const code = sixDigits();
  await db.batch([
    db.prepare('UPDATE shop_email_codes SET usedAt = ? WHERE customerId = ? AND usedAt IS NULL').bind(now, customer.id),
    db
      .prepare('INSERT INTO shop_email_codes (id, customerId, codeHash, expiresAt, attempts, usedAt, createdAt) VALUES (?, ?, ?, ?, 0, NULL, ?)')
      .bind(id, customer.id, await codeHash(id, code), now + EMAIL_CODE_MINUTES * 60_000, now),
    db.prepare('DELETE FROM shop_email_codes WHERE createdAt < ?').bind(now - 7 * 86400_000),
  ]);
  return code;
}

/**
 * Checks the code the customer typed. Right: the email counts as confirmed and the welcome voucher is returned (to
 * email). Wrong: one of the 5 tries is used up.
 */
export async function verifyEmailCode(db: D1Database, customer: Customer, input: unknown, now: number): Promise<Voucher | null> {
  if (customer.emailVerifiedAt !== null) throw new AppError(409, 'Email Anda sudah dikonfirmasi.');
  const typed = String(input ?? '').replace(/\D/g, '');
  const row = await db
    .prepare('SELECT id, codeHash, expiresAt FROM shop_email_codes WHERE customerId = ? AND usedAt IS NULL ORDER BY createdAt DESC LIMIT 1')
    .bind(customer.id)
    .first<{ id: string; codeHash: string; expiresAt: number }>();
  if (!row || Number(row.expiresAt) < now) throw new AppError(400, 'Kode sudah tidak berlaku. Tekan "Kirim ulang kode".');
  // The try is counted before the code is checked, in one step, so guesses sent at the same time cannot get past 5.
  const counted = await db
    .prepare('UPDATE shop_email_codes SET attempts = attempts + 1 WHERE id = ? AND attempts < ? RETURNING attempts')
    .bind(row.id, MAX_TRIES)
    .first<{ attempts: number }>();
  if (!counted) throw new AppError(400, 'Terlalu banyak kode salah. Tekan "Kirim ulang kode" untuk kode baru.');
  if (typed.length !== 6 || (await codeHash(row.id, typed)) !== row.codeHash) {
    const left = MAX_TRIES - Number(counted.attempts);
    throw new AppError(400, left > 0 ? `Kode salah. Sisa ${left} kali percobaan.` : 'Kode salah. Tekan "Kirim ulang kode" untuk kode baru.');
  }
  await db.prepare('UPDATE shop_email_codes SET usedAt = ? WHERE id = ?').bind(now, row.id).run();
  return markEmailVerified(db, customer.id, now);
}

/**
 * Marks the email as confirmed (code typed, or a password reset link from that inbox was used) and gives the welcome
 * voucher. Returns the voucher only the first time; null when the email was already confirmed.
 */
export async function markEmailVerified(db: D1Database, customerId: string, now: number, giveWelcome = true): Promise<Voucher | null> {
  const update = await db
    .prepare('UPDATE shop_customers SET emailVerifiedAt = ?, updatedAt = ? WHERE id = ? AND emailVerifiedAt IS NULL')
    .bind(now, now, customerId)
    .run();
  if (!update.meta.changes || !giveWelcome) return null;
  return issueVoucher(db, { customerId, kind: 'WELCOME', now });
}
