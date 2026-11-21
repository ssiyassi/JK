// Attempt limits for the shop's public forms, so nobody can flood a customer's inbox with reset emails, create
// accounts in bulk for welcome vouchers, or try passwords against many emails. Framework-free.
import { AppError, type D1Database } from '../core/d1.ts';

export interface Limit {
  /** e.g. "login:ip:1.2.3.4" or "forgot:email:rini@example.com" */
  key: string;
  max: number;
  windowMs: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
/** Rows older than this are deleted; no limit may use a longer window. */
const KEEP_MS = HOUR;

export const LIMITS = {
  login: (ip: string): Limit => ({ key: `login:ip:${ip}`, max: 30, windowMs: 15 * MINUTE }),
  register: (ip: string): Limit => ({ key: `register:ip:${ip}`, max: 5, windowMs: HOUR }),
  forgotIp: (ip: string): Limit => ({ key: `forgot:ip:${ip}`, max: 10, windowMs: HOUR }),
  forgotEmail: (email: string): Limit => ({ key: `forgot:email:${email.trim().toLowerCase()}`, max: 3, windowMs: HOUR }),
  reset: (ip: string): Limit => ({ key: `reset:ip:${ip}`, max: 10, windowMs: HOUR }),
  /** Voucher codes tried at checkout, so nobody can guess admin voucher codes by trying many. */
  voucherTry: (customerId: string): Limit => ({ key: `voucher:customer:${customerId}`, max: 20, windowMs: 15 * MINUTE }),
  /** New website orders, so one account cannot fill the order list with unpaid orders. */
  order: (customerId: string): Limit => ({ key: `order:customer:${customerId}`, max: 10, windowMs: HOUR }),
  /** Guest checkout (not signed in): orders and voucher tries per IP. */
  guestOrder: (ip: string): Limit => ({ key: `order:ip:${ip}`, max: 10, windowMs: HOUR }),
  guestVoucherTry: (ip: string): Limit => ({ key: `voucher:ip:${ip}`, max: 20, windowMs: 15 * MINUTE }),
  /** Address search at checkout (paid Google calls): typing suggestions and picked places per IP. */
  placesSearch: (ip: string): Limit => ({ key: `places:search:${ip}`, max: 60, windowMs: 15 * MINUTE }),
  placesDetails: (ip: string): Limit => ({ key: `places:details:${ip}`, max: 15, windowMs: 15 * MINUTE }),
  /** Influencer pages: accepting an offer and signing up on jentiskitchen.id/collab, per IP. */
  collabAccept: (ip: string): Limit => ({ key: `collab:accept:${ip}`, max: 10, windowMs: HOUR }),
  collabApply: (ip: string): Limit => ({ key: `collab:apply:${ip}`, max: 5, windowMs: HOUR }),
  /** Affiliate sign-up on jentiskitchen.id/affiliate, per IP. */
  affiliateApply: (ip: string): Limit => ({ key: `affiliate:apply:${ip}`, max: 5, windowMs: HOUR }),
  /** "Lihat link & komisi saya": emails their links again, per IP and per email so nobody's inbox gets flooded. */
  affiliateLinkIp: (ip: string): Limit => ({ key: `affiliate:link:ip:${ip}`, max: 10, windowMs: HOUR }),
  affiliateLinkEmail: (email: string): Limit => ({ key: `affiliate:link:email:${email.trim().toLowerCase()}`, max: 3, windowMs: HOUR }),
  /** Reseller stamp card look-ups by phone number (jentiskitchen.id/stamp), so nobody can try many numbers. */
  stampLookup: (ip: string): Limit => ({ key: `stamp:ip:${ip}`, max: 30, windowMs: 15 * MINUTE }),
  /** Payday posters made (jentiskitchen.id/payday-promo), so nobody can fill the admin list. */
  paydayPoster: (ip: string): Limit => ({ key: `payday-poster:ip:${ip}`, max: 30, windowMs: HOUR }),
};

export const RATE_LIMIT_MESSAGE = 'Terlalu banyak percobaan. Silakan coba lagi nanti.';

/** Counts one attempt for each limit; throws 429 (without counting) when any of them is already used up. */
export async function hitRateLimits(db: D1Database, limits: Limit[], now: number): Promise<void> {
  for (const l of limits) {
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM shop_rate_limits WHERE key = ? AND at > ?')
      .bind(l.key, now - l.windowMs)
      .first<{ n: number }>();
    if (Number(row?.n ?? 0) >= l.max) throw new AppError(429, RATE_LIMIT_MESSAGE);
  }
  await db.batch([
    ...limits.map((l) => db.prepare('INSERT INTO shop_rate_limits (key, at) VALUES (?, ?)').bind(l.key, now)),
    db.prepare('DELETE FROM shop_rate_limits WHERE at < ?').bind(now - KEEP_MS),
  ]);
}
