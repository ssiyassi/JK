import { AppError, isUniqueViolation, newId, type D1Database } from '../core/d1.ts';
import { markEmailVerified } from './email-verify.ts';
import type { Voucher } from './vouchers.ts';
import {
  hashPassword,
  normalizeEmail,
  normalizePhone,
  randomToken,
  requireText,
  sha256,
  validatePassword,
  verifyPassword,
} from './util.ts';

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string;
  referredById: string | null;
  createdAt: number;
  /** Set when the owner deactivated the account in the admin; null = active. */
  disabledAt: number | null;
  /** When the customer confirmed their email (code or reset link); null = not yet, so no monthly vouchers. */
  emailVerifiedAt: number | null;
  /** False for accounts made at guest checkout until the customer sets a password from the emailed link. */
  hasPassword: boolean;
  /** This session was opened by the owner with "Login as customer" (only set on the signed-in customer). */
  adminSession?: boolean;
}

/**
 * Someone checking out without signing in. Name and phone come from the delivery details; the email is optional.
 * createAccount: may make a new account from these details (false when the sign-up limit for their IP is used up).
 */
export interface Guest {
  guest: true;
  email: string | null;
  phone: string | null;
  createAccount?: boolean;
}

/** Who places an order or checks a voucher: a signed-in customer or a guest. */
export type Buyer = Customer | Guest;

export const isGuest = (b: Buyer): b is Guest => 'guest' in b;

function mapCustomer(r: Record<string, unknown>): Customer {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    phone: String(r.phone),
    referredById: (r.referredById as string | null) ?? null,
    createdAt: Number(r.createdAt),
    disabledAt: r.disabledAt == null ? null : Number(r.disabledAt),
    emailVerifiedAt: r.emailVerifiedAt == null ? null : Number(r.emailVerifiedAt),
    hasPassword: Boolean(r.passwordHash),
    adminSession: Number(r.byAdmin ?? 0) === 1,
  };
}

export async function getCustomer(db: D1Database, id: string): Promise<Customer | null> {
  const row = await db.prepare('SELECT * FROM shop_customers WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return row ? mapCustomer(row) : null;
}

export const SESSION_DAYS = 30;

/** Placeholder password of accounts made at guest checkout: no password matches it (see verifyPassword). */
export const NO_PASSWORD = '';

/** The account with this email, or null. */
export async function findCustomerByEmail(db: D1Database, email: string): Promise<Customer | null> {
  const row = await db.prepare('SELECT * FROM shop_customers WHERE email = ?').bind(email.trim().toLowerCase()).first<Record<string, unknown>>();
  return row ? mapCustomer(row) : null;
}

/**
 * New account: name, email, phone, password and optionally the phone number of the friend who referred them.
 * The email and the phone must not belong to an existing account. The register route then marks the email as
 * confirmed and gives the welcome voucher right away (markEmailVerified).
 */
export async function registerCustomer(
  db: D1Database,
  body: Record<string, unknown>,
  now: number,
): Promise<{ customer: Customer }> {
  const name = requireText(body.name, 'Nama', 100);
  const email = normalizeEmail(body.email);
  const phone = normalizePhone(body.phone);
  const password = validatePassword(body.password);

  let referredById: string | null = null;
  const referrerInput = typeof body.referrerPhone === 'string' ? body.referrerPhone.trim() : '';
  if (referrerInput) {
    let referrerPhone: string;
    try {
      referrerPhone = normalizePhone(referrerInput);
    } catch {
      throw new AppError(400, 'Nomor HP pemberi referral tidak valid');
    }
    if (referrerPhone === phone) throw new AppError(400, 'Nomor referral tidak boleh nomor Anda sendiri');
    const referrer = await db.prepare('SELECT id FROM shop_customers WHERE phone = ? AND disabledAt IS NULL').bind(referrerPhone).first<{ id: string }>();
    if (!referrer) throw new AppError(400, 'Nomor HP pemberi referral belum terdaftar');
    referredById = referrer.id;
  }

  if (await db.prepare('SELECT 1 FROM shop_customers WHERE email = ?').bind(email).first()) {
    throw new AppError(409, 'Email ini sudah terdaftar. Silakan masuk.');
  }
  if (await db.prepare('SELECT 1 FROM shop_customers WHERE phone = ?').bind(phone).first()) {
    throw new AppError(409, 'Nomor HP ini sudah terdaftar di akun lain.');
  }

  const id = newId();
  const passwordHash = await hashPassword(password);
  try {
    await db
      .prepare(
        `INSERT INTO shop_customers (id, email, name, phone, passwordHash, referredById, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, email, name, phone, passwordHash, referredById, now, now)
      .run();
  } catch (error) {
    // Two sign-ups with the same email/phone at the same moment: only one succeeds.
    if (isUniqueViolation(error, 'email')) throw new AppError(409, 'Email ini sudah terdaftar. Silakan masuk.');
    if (isUniqueViolation(error, 'phone')) throw new AppError(409, 'Nomor HP ini sudah terdaftar di akun lain.');
    throw error;
  }
  const customer = await getCustomer(db, id);
  if (!customer) throw new Error('Customer was created but could not be read back');
  return { customer };
}

export const DISABLED_MESSAGE = 'Akun ini sudah dinonaktifkan. Silakan hubungi kami melalui WhatsApp.';

let dummy: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomToken());
  return dummy;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

export async function loginCustomer(db: D1Database, body: Record<string, unknown>, now: number): Promise<Customer> {
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  const failures = await db
    .prepare('SELECT COUNT(*) AS n FROM shop_login_failures WHERE email = ? AND at > ?')
    .bind(email, now - LOGIN_WINDOW_MS)
    .first<{ n: number }>();
  if (Number(failures?.n ?? 0) >= LOGIN_MAX_FAILURES) {
    throw new AppError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit atau reset password.');
  }

  const row = await db.prepare('SELECT * FROM shop_customers WHERE email = ?').bind(email).first<Record<string, unknown>>();
  // Unknown email: still check a password, so the answer takes as long as for a real account.
  const stored = row ? String(row.passwordHash) : await dummyHash();
  if (!(await verifyPassword(password, stored)) || !row) {
    await db.batch([
      db.prepare('INSERT INTO shop_login_failures (email, at) VALUES (?, ?)').bind(email, now),
      db.prepare('DELETE FROM shop_login_failures WHERE at < ?').bind(now - LOGIN_WINDOW_MS),
    ]);
    throw new AppError(401, 'Email atau password salah');
  }
  await db.prepare('DELETE FROM shop_login_failures WHERE email = ?').bind(email).run();
  // Checked only after the password, so the message never tells a stranger which emails have an account.
  if (row.disabledAt != null) throw new AppError(403, DISABLED_MESSAGE);
  return mapCustomer(row);
}

// ---- "Login as customer" (admin): a one-time link opens a short session on the shop's own domain ----

const ADMIN_LINK_MS = 5 * 60 * 1000;
/** How long the owner stays signed in as the customer. */
export const ADMIN_SESSION_HOURS = 2;

/** A one-time sign-in token for this customer, valid for 5 minutes. Refused for deactivated accounts. */
export async function createAdminLoginToken(db: D1Database, customerId: string, createdBy: string | null, now: number): Promise<string> {
  const customer = await getCustomer(db, customerId);
  if (!customer) throw new AppError(404, 'Customer not found');
  if (customer.disabledAt !== null) throw new AppError(409, 'This customer is deactivated. Reactivate them first.');
  const token = randomToken();
  await db
    .prepare('INSERT INTO shop_admin_logins (tokenHash, customerId, createdBy, createdAt, expiresAt, usedAt) VALUES (?, ?, ?, ?, ?, NULL)')
    .bind(await sha256(token), customerId, createdBy, now, now + ADMIN_LINK_MS)
    .run();
  return token;
}

/** Uses a one-time token (works once, before it expires) and returns the token of a new short admin session, or null. */
export async function redeemAdminLoginToken(db: D1Database, token: string, now: number): Promise<string | null> {
  if (!token) return null;
  const claim = await db
    .prepare('UPDATE shop_admin_logins SET usedAt = ? WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > ? RETURNING customerId')
    .bind(now, await sha256(token), now)
    .first<{ customerId: string }>();
  if (!claim) return null;
  const customer = await getCustomer(db, claim.customerId);
  if (!customer || customer.disabledAt !== null) return null;
  return createSession(db, customer.id, now, { byAdmin: true });
}

/** Returns the secret token for the session cookie. */
export async function createSession(db: D1Database, customerId: string, now: number, options: { byAdmin?: boolean } = {}): Promise<string> {
  const token = randomToken();
  const lifetime = options.byAdmin ? ADMIN_SESSION_HOURS * 3600000 : SESSION_DAYS * 86400000;
  await db.batch([
    db
      .prepare('INSERT INTO shop_sessions (tokenHash, customerId, expiresAt, createdAt, byAdmin) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256(token), customerId, now + lifetime, now, options.byAdmin ? 1 : 0),
    db.prepare('DELETE FROM shop_sessions WHERE expiresAt < ?').bind(now),
  ]);
  return token;
}

export async function customerForSession(db: D1Database, token: string | undefined, now: number): Promise<Customer | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT c.*, s.byAdmin FROM shop_sessions s JOIN shop_customers c ON c.id = s.customerId
       WHERE s.tokenHash = ? AND s.expiresAt > ? AND c.disabledAt IS NULL`,
    )
    .bind(await sha256(token), now)
    .first<Record<string, unknown>>();
  return row ? mapCustomer(row) : null;
}

export async function deleteSession(db: D1Database, token: string | undefined): Promise<void> {
  if (token) await db.prepare('DELETE FROM shop_sessions WHERE tokenHash = ?').bind(await sha256(token)).run();
}

const RESET_MS = 60 * 60 * 1000;
/** "Buat password" links sent after a guest checkout made the account. */
export const SETUP_LINK_DAYS = 7;

/**
 * A link for an account made at guest checkout to set its first password (same table and page as password resets,
 * valid for SETUP_LINK_DAYS). Using it also confirms the email.
 */
export async function createPasswordSetupToken(db: D1Database, customerId: string, now: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare('INSERT INTO shop_password_resets (tokenHash, customerId, expiresAt, usedAt) VALUES (?, ?, ?, NULL)')
    .bind(await sha256(token), customerId, now + SETUP_LINK_DAYS * 86400_000)
    .run();
  return token;
}

/** Returns a reset token to email, or null when the email has no account (the caller answers the same either way). */
export async function startPasswordReset(
  db: D1Database,
  rawEmail: unknown,
  now: number,
): Promise<{ token: string; customer: Customer } | null> {
  const email = normalizeEmail(rawEmail);
  const row = await db
    .prepare('SELECT * FROM shop_customers WHERE email = ? AND disabledAt IS NULL')
    .bind(email)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const token = randomToken();
  await db
    .prepare('INSERT INTO shop_password_resets (tokenHash, customerId, expiresAt, usedAt) VALUES (?, ?, ?, NULL)')
    .bind(await sha256(token), String(row.id), now + RESET_MS)
    .run();
  return { token, customer: mapCustomer(row) };
}

/**
 * Sets the new password and signs out every device. Each link works once, for one hour. The link came from the
 * customer's inbox, so it also confirms the email (welcome voucher returned if this is the first confirmation).
 */
export async function finishPasswordReset(
  db: D1Database,
  body: Record<string, unknown>,
  now: number,
): Promise<{ customer: Customer; welcome: Voucher | null }> {
  const token = typeof body.token === 'string' ? body.token : '';
  const password = validatePassword(body.password);
  const tokenHash = await sha256(token);
  const reset = await db
    .prepare('SELECT customerId FROM shop_password_resets WHERE tokenHash = ? AND usedAt IS NULL AND expiresAt > ?')
    .bind(tokenHash, now)
    .first<{ customerId: string }>();
  if (!reset) throw new AppError(400, 'Link reset sudah tidak berlaku. Silakan minta link baru.');
  const passwordHash = await hashPassword(password);
  const [claim] = await db.batch([
    db.prepare('UPDATE shop_password_resets SET usedAt = ? WHERE tokenHash = ? AND usedAt IS NULL').bind(now, tokenHash),
    db
      .prepare(
        `UPDATE shop_customers SET passwordHash = ?, updatedAt = ?
         WHERE id = ? AND disabledAt IS NULL AND EXISTS (SELECT 1 FROM shop_password_resets WHERE tokenHash = ? AND usedAt = ?)`,
      )
      .bind(passwordHash, now, reset.customerId, tokenHash, now),
    db.prepare('DELETE FROM shop_sessions WHERE customerId = ?').bind(reset.customerId),
    // Other reset links sent earlier stop working too.
    db.prepare('UPDATE shop_password_resets SET usedAt = ? WHERE customerId = ? AND usedAt IS NULL').bind(now, reset.customerId),
  ]);
  if (!claim.meta.changes) throw new AppError(400, 'Link reset sudah tidak berlaku. Silakan minta link baru.');
  const customer = await getCustomer(db, reset.customerId);
  if (!customer) throw new AppError(404, 'Akun tidak ditemukan');
  // A stranger's wrong passwords must not keep the owner of the account locked out after they chose a new one.
  await db.prepare('DELETE FROM shop_login_failures WHERE email = ?').bind(customer.email).run();
  const welcome = await markEmailVerified(db, customer.id, now);
  return { customer: welcome ? (await getCustomer(db, customer.id))! : customer, welcome };
}

// ---- Admin: customer management (admin.jentiskitchen.id → Website → Customers) ----

export interface AdminCustomer extends Customer {
  referredByName: string | null;
  /** Paid website orders that were not cancelled. */
  orders: number;
  lastOrderAt: number | null;
}

/** Every customer, newest first, with their order count. The admin page filters this list in the browser. */
export async function listCustomersForAdmin(db: D1Database, limit = 2000): Promise<AdminCustomer[]> {
  const { results } = await db
    .prepare(
      `SELECT c.*, r.name AS referredByName,
         (SELECT COUNT(*) FROM shop_orders x JOIN orders o ON o.id = x.orderRowId
           WHERE x.customerId = c.id AND x.stockTakenAt IS NOT NULL AND o.orderStatus != 'CANCELLED') AS orderCount,
         (SELECT MAX(x.createdAt) FROM shop_orders x WHERE x.customerId = c.id) AS lastOrderAt
       FROM shop_customers c LEFT JOIN shop_customers r ON r.id = c.referredById
       ORDER BY c.createdAt DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    ...mapCustomer(r),
    referredByName: (r.referredByName as string | null) ?? null,
    orders: Number(r.orderCount ?? 0),
    lastOrderAt: r.lastOrderAt == null ? null : Number(r.lastOrderAt),
  }));
}

/**
 * The owner corrects a customer's name, email or phone. The same rules as registration apply (valid format, email and
 * phone not used by another account). Past orders keep the recipient details they were placed with.
 */
export async function updateCustomerByAdmin(
  db: D1Database,
  id: string,
  body: Record<string, unknown>,
  now: number,
): Promise<Customer> {
  const existing = await getCustomer(db, id);
  if (!existing) throw new AppError(404, 'Customer not found');
  let name: string, email: string, phone: string;
  try {
    name = requireText(body.name ?? existing.name, 'Name', 100);
  } catch {
    throw new AppError(400, 'Name is required (max 100 characters)');
  }
  try {
    email = normalizeEmail(body.email ?? existing.email);
  } catch {
    throw new AppError(400, 'That email address is not valid');
  }
  try {
    phone = normalizePhone(body.phone ?? existing.phone);
  } catch {
    throw new AppError(400, 'That phone number is not valid (example: 081234567890)');
  }
  if (await db.prepare('SELECT 1 FROM shop_customers WHERE email = ? AND id != ?').bind(email, id).first()) {
    throw new AppError(409, 'Another customer already uses this email');
  }
  if (await db.prepare('SELECT 1 FROM shop_customers WHERE phone = ? AND id != ?').bind(phone, id).first()) {
    throw new AppError(409, 'Another customer already uses this phone number');
  }
  try {
    await db
      .prepare('UPDATE shop_customers SET name = ?, email = ?, phone = ?, updatedAt = ? WHERE id = ?')
      .bind(name, email, phone, now, id)
      .run();
  } catch (error) {
    if (isUniqueViolation(error, 'email')) throw new AppError(409, 'Another customer already uses this email');
    if (isUniqueViolation(error, 'phone')) throw new AppError(409, 'Another customer already uses this phone number');
    throw error;
  }
  return (await getCustomer(db, id))!;
}

/**
 * Deactivate (signs them out everywhere; no login, password reset or monthly voucher) or reactivate a customer.
 * Orders, vouchers and the account itself are kept, so reactivating restores everything.
 */
export async function setCustomerDisabled(db: D1Database, id: string, disabled: boolean, now: number): Promise<Customer> {
  const statements = [
    db.prepare('UPDATE shop_customers SET disabledAt = ?, updatedAt = ? WHERE id = ?').bind(disabled ? now : null, now, id),
  ];
  if (disabled) statements.push(db.prepare('DELETE FROM shop_sessions WHERE customerId = ?').bind(id));
  const [update] = await db.batch(statements);
  if (!update.meta.changes) throw new AppError(404, 'Customer not found');
  return (await getCustomer(db, id))!;
}
