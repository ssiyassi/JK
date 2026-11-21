// "Buat pesanan untuk pelanggan": the owner places a website order for a customer (e.g. one who asked on WhatsApp) and
// sends them the order link to pay. Admin → Website Orders makes a one-time link (5 minutes) that opens the shop
// checkout in "admin mode" for a few hours; only a hash of each token is stored. Framework-free.
import { AppError, type D1Database } from '../core/d1.ts';
import type { Attribution } from './attribution.ts';
import { findOwnerSource } from './ownerSources.ts';
import { normalizePhone, randomToken, sha256 } from './util.ts';

const OWNER_LINK_MS = 5 * 60 * 1000;
/** How long admin mode stays on in the owner's browser. */
export const OWNER_SESSION_HOURS = 12;
/** Browser cookie holding the admin-mode session token. */
export const OWNER_COOKIE = 'jk_owner';

/** A one-time link token for admin mode, valid for 5 minutes. */
export async function createOwnerLinkToken(db: D1Database, createdBy: string | null, now: number): Promise<string> {
  const token = randomToken();
  await db
    .prepare("INSERT INTO shop_owner_sessions (tokenHash, kind, createdBy, createdAt, expiresAt, usedAt) VALUES (?, 'LINK', ?, ?, ?, NULL)")
    .bind(await sha256(token), createdBy, now, now + OWNER_LINK_MS)
    .run();
  return token;
}

/** Uses a one-time link (works once, before it expires) and returns the token of a new admin-mode session, or null. */
export async function redeemOwnerLinkToken(db: D1Database, token: string, now: number): Promise<string | null> {
  if (!token) return null;
  const claim = await db
    .prepare("UPDATE shop_owner_sessions SET usedAt = ? WHERE tokenHash = ? AND kind = 'LINK' AND usedAt IS NULL AND expiresAt > ? RETURNING createdBy")
    .bind(now, await sha256(token), now)
    .first<{ createdBy: string | null }>();
  if (!claim) return null;
  const session = randomToken();
  await db.batch([
    db
      .prepare("INSERT INTO shop_owner_sessions (tokenHash, kind, createdBy, createdAt, expiresAt, usedAt) VALUES (?, 'SESSION', ?, ?, ?, NULL)")
      .bind(await sha256(session), claim.createdBy, now, now + OWNER_SESSION_HOURS * 3600000),
    db.prepare('DELETE FROM shop_owner_sessions WHERE expiresAt < ?').bind(now - 7 * 86400000),
  ]);
  return session;
}

/** Who is in admin mode with this session token ('owner' when the admin login is unknown), or null. */
export async function ownerForSession(db: D1Database, token: string | undefined, now: number): Promise<string | null> {
  if (!token) return null;
  const row = await db
    .prepare("SELECT createdBy FROM shop_owner_sessions WHERE tokenHash = ? AND kind = 'SESSION' AND expiresAt > ?")
    .bind(await sha256(token), now)
    .first<{ createdBy: string | null }>();
  return row ? row.createdBy || 'owner' : null;
}

/**
 * The attribution saved on an order the owner placed: only the ad / link tags of the source picked ("Pelanggan datang
 * dari"), never the owner's own browser IDs, IP or device. Null for "Tanpa kode".
 */
export function ownerAttribution(sourceCode: unknown, now: number): Attribution | null {
  const source = findOwnerSource(sourceCode);
  if (!source) throw new AppError(400, 'Pilih dari mana pelanggan datang');
  if (!source.tags.utm_source) return null;
  return { utm_medium: 'owner-order', ...source.tags, landing: '/pesanan-admin', at: now };
}

/** Marks a just-placed order as the owner's: the customer picks how to pay (no method yet) and has 24 hours. */
export async function markOwnerOrder(db: D1Database, orderRowId: string, owner: string, attribution: Attribution | null): Promise<void> {
  await db
    .prepare('UPDATE shop_orders SET placedByOwner = ?, paymentMethod = NULL, attribution = ? WHERE orderRowId = ?')
    .bind(owner, attribution ? JSON.stringify(attribution) : null, orderRowId)
    .run();
}

/** wa.me link to the customer with the order link to pay ("Kirim link bayar"). Phone as stored (e.g. 0812…/62812…). */
export function payLinkWhatsApp(order: { orderId: string; total: number; recipientName: string; recipientPhone: string }, orderLink: string, totalText: string): string {
  let phone = '';
  try {
    phone = normalizePhone(order.recipientPhone);
  } catch {
    // Not a valid Indonesian mobile number: WhatsApp opens without a chat, the owner picks the contact.
  }
  const name = order.recipientName.trim().split(/\s+/)[0] || 'Kak';
  const text =
    `Halo Kak ${name}, ini pesanan Jentis Kitchen #${order.orderId} sebesar ${totalText}.\n\n` +
    `Silakan bayar lewat link ini (bisa QRIS, OVO, ShopeePay, DANA atau transfer BCA):\n${orderLink}\n\n` +
    'Link berlaku 24 jam. Terima kasih!';
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
