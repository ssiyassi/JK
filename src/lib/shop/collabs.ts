// Influencer collaborations (Website → Collabs). The owner makes one private offer page per influencer
// (jentiskitchen.id/collab/<slug>, kept out of Google) showing their tracking link and the voucher code they will get.
// The voucher is NOT created here: the owner makes it in Website → Vouchers once the influencer accepts on the page.
// First orders are counted by the link (utm_campaign, see attribution.ts), repeat orders by the voucher code.
// The public page jentiskitchen.id/collab lets influencers sign up (applications).
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';
import { normalizePhone, optionalText, randomCode, requireText } from './util.ts';

/** Same as SITE_URL in seo.ts (not imported: seo.ts is not loadable in the Node tests). Pages pass emailLinks().shopUrl. */
const SITE_URL = 'https://jentiskitchen.id';

export const COLLAB_PLATFORMS = ['instagram', 'tiktok'] as const;
export type CollabPlatform = (typeof COLLAB_PLATFORMS)[number];
export const PLATFORM_LABELS: Record<CollabPlatform, string> = { instagram: 'Instagram', tiktok: 'TikTok' };

/** Starting values of the "Create collab page" form (owner's terms, 2026-10-25); every one is editable per influencer. */
export const COLLAB_DEFAULTS = {
  platform: 'instagram' as CollabPlatform,
  freeProducts: '1 box Babi Marinade + 1 box Sapi Marinade',
  commissionPerBox: 10_000,
  codePercent: 20,
  codeCap: 100_000,
  contentDays: 14,
  minReels: 1,
  minStories: 2,
  contractMonths: 3,
};

/** Commission is transferred every week (owner's choice). Shown on the pages. */
export const PAYOUT_TEXT = 'setiap hari Minggu';

export interface Collab {
  id: string;
  slug: string;
  name: string;
  platform: CollabPlatform;
  handle: string;
  campaign: string;
  voucherCode: string;
  codePercent: number;
  codeCap: number;
  commissionPerBox: number;
  freeProducts: string;
  contentDays: number;
  minReels: number;
  minStories: number;
  startDate: string;
  endDate: string;
  note: string;
  acceptedAt: number | null;
  accepted: CollabAcceptance | null;
  disabledAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CollabAcceptance {
  name: string;
  whatsapp: string;
  address: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  message: string;
}

/** What the public page may show: never the acceptance details (address, bank) or the owner's note. */
export type PublicCollab = Omit<Collab, 'accepted' | 'note'>;

export interface CollabApplication {
  id: string;
  name: string;
  platform: CollabPlatform;
  handle: string;
  followers: string;
  whatsapp: string;
  city: string;
  message: string;
  collabId: string | null;
  createdAt: number;
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function toCollab(r: Record<string, unknown>): Collab {
  return {
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    platform: (COLLAB_PLATFORMS as readonly string[]).includes(str(r.platform)) ? (str(r.platform) as CollabPlatform) : 'instagram',
    handle: str(r.handle),
    campaign: str(r.campaign),
    voucherCode: str(r.voucherCode),
    codePercent: Number(r.codePercent),
    codeCap: Number(r.codeCap),
    commissionPerBox: Number(r.commissionPerBox),
    freeProducts: str(r.freeProducts),
    contentDays: Number(r.contentDays),
    minReels: Number(r.minReels),
    minStories: Number(r.minStories),
    startDate: str(r.startDate),
    endDate: str(r.endDate),
    note: str(r.note),
    acceptedAt: r.acceptedAt === null || r.acceptedAt === undefined ? null : Number(r.acceptedAt),
    accepted:
      r.acceptedAt === null || r.acceptedAt === undefined
        ? null
        : {
            name: str(r.acceptedName),
            whatsapp: str(r.acceptedWhatsapp),
            address: str(r.acceptedAddress),
            bank: str(r.acceptedBank),
            accountNumber: str(r.acceptedAccountNumber),
            accountName: str(r.acceptedAccountName),
            message: str(r.acceptedMessage),
          },
    disabledAt: r.disabledAt === null || r.disabledAt === undefined ? null : Number(r.disabledAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

export function publicCollab(c: Collab): PublicCollab {
  const rest: Partial<Collab> = { ...c };
  delete rest.accepted;
  delete rest.note;
  return rest as PublicCollab;
}

/** "Sarah Wijaya" → "sarah-wijaya" (letters, digits and dashes only). */
export function slugify(text: string, max = 30): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** The influencer's shop link: their name in utm_campaign, so first orders through it count for them. */
export function collabShopLink(c: Pick<Collab, 'platform' | 'campaign'>, siteUrl = SITE_URL): string {
  return `${siteUrl}/?utm_source=${c.platform}&utm_medium=influencer&utm_campaign=${encodeURIComponent(c.campaign)}`;
}

export function collabPageLink(c: Pick<Collab, 'slug'>, siteUrl = SITE_URL): string {
  return `${siteUrl}/collab/${c.slug}`;
}

/** Contract over (after its last day, WIB) or page switched off: the page no longer takes acceptances. */
export function collabClosed(c: Pick<Collab, 'disabledAt' | 'endDate'>, now: number): boolean {
  return c.disabledAt !== null || c.endDate < jakartaDateKey(now);
}

// ---------------------------------------------------------------------------
// Admin: create / edit
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function whole(v: unknown, label: string, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(str(v).replace(/[.\s]/g, ''));
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError(400, `${label}: enter a whole number from ${min} to ${max.toLocaleString('en-US')}`);
  return n;
}

function date(v: unknown, label: string): string {
  const s = str(v).trim();
  if (!DATE.test(s) || Number.isNaN(Date.parse(s))) throw new AppError(400, `Please choose the ${label}`);
  return s;
}

type CollabTerms = Omit<Collab, 'id' | 'slug' | 'acceptedAt' | 'accepted' | 'disabledAt' | 'createdAt' | 'updatedAt'>;

export function parseCollabTerms(body: Record<string, unknown>): CollabTerms {
  const name = str(body.name).trim();
  if (!name) throw new AppError(400, 'Please type the influencer’s name');
  if (name.length > 60) throw new AppError(400, 'The name is too long (max 60 characters)');
  const platform = str(body.platform) as CollabPlatform;
  if (!COLLAB_PLATFORMS.includes(platform)) throw new AppError(400, 'Please choose Instagram or TikTok');
  const handle = str(body.handle).trim().replace(/^@+/, '');
  if (handle && !/^[A-Za-z0-9._]{1,40}$/.test(handle)) throw new AppError(400, 'The handle may only have letters, numbers, dots and underscores');
  const campaign = slugify(str(body.campaign).trim() || name, 40);
  if (!campaign) throw new AppError(400, 'Please type the link name (e.g. sarah)');
  const voucherCode = str(body.voucherCode).trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(voucherCode)) throw new AppError(400, 'The voucher code must be 3–20 letters or numbers, no spaces (e.g. SARAH)');
  const freeProducts = str(body.freeProducts).trim();
  if (!freeProducts) throw new AppError(400, 'Please type the free products you will send');
  if (freeProducts.length > 200) throw new AppError(400, 'Free products: too long (max 200 characters)');
  const startDate = date(body.startDate, 'contract start date');
  const endDate = date(body.endDate, 'contract end date');
  if (endDate < startDate) throw new AppError(400, 'The contract must end on or after its start date');
  return {
    name,
    platform,
    handle,
    campaign,
    voucherCode,
    codePercent: whole(body.codePercent, 'Code discount %', 1, 100),
    codeCap: whole(body.codeCap, 'Max discount', 0, 10_000_000),
    commissionPerBox: whole(body.commissionPerBox, 'Commission per box', 0, 10_000_000),
    freeProducts,
    contentDays: whole(body.contentDays, 'Content within (days)', 1, 365),
    minReels: whole(body.minReels, 'Reels', 0, 50),
    minStories: whole(body.minStories, 'Stories', 0, 100),
    startDate,
    endDate,
    note: str(body.note).trim().slice(0, 300),
  };
}

/** Link name and voucher code must be unique among collab pages, otherwise two influencers' sales would mix. */
async function assertUnique(db: D1Database, t: Pick<CollabTerms, 'campaign' | 'voucherCode'>, exceptId: string | null) {
  const clash = await db
    .prepare('SELECT name, campaign, voucherCode FROM shop_collabs WHERE (campaign = ? OR voucherCode = ?) AND id != ? LIMIT 1')
    .bind(t.campaign, t.voucherCode, exceptId ?? '')
    .first<{ name: string; campaign: string; voucherCode: string }>();
  if (!clash) return;
  if (clash.campaign === t.campaign) throw new AppError(409, `The link name “${t.campaign}” is already used by ${clash.name}. Please choose another one.`);
  throw new AppError(409, `The voucher code ${t.voucherCode} is already used by ${clash.name}. Please choose another one.`);
}

const TERM_COLUMNS = [
  'name', 'platform', 'handle', 'campaign', 'voucherCode', 'codePercent', 'codeCap', 'commissionPerBox', 'freeProducts',
  'contentDays', 'minReels', 'minStories', 'startDate', 'endDate', 'note',
] as const;
const termValues = (t: CollabTerms) => TERM_COLUMNS.map((k) => (k === 'handle' || k === 'note' ? t[k] || null : t[k]));

export async function createCollab(db: D1Database, body: Record<string, unknown>, now: number): Promise<Collab> {
  const terms = parseCollabTerms(body);
  await assertUnique(db, terms, null);
  const id = newId();
  for (let attempt = 0; ; attempt++) {
    const slug = `${slugify(terms.name, 24) || 'collab'}-${randomCode(4).toLowerCase()}`;
    try {
      await db
        .prepare(
          `INSERT INTO shop_collabs (id, slug, ${TERM_COLUMNS.join(', ')}, createdAt, updatedAt)
           VALUES (?, ?, ${TERM_COLUMNS.map(() => '?').join(', ')}, ?, ?)`,
        )
        .bind(id, slug, ...termValues(terms), now, now)
        .run();
      break;
    } catch (error) {
      if (attempt < 3 && /UNIQUE/i.test(String(error))) continue;
      throw error;
    }
  }
  if (body.applicationId) {
    await db.prepare('UPDATE shop_collab_applications SET collabId = ? WHERE id = ? AND collabId IS NULL').bind(id, str(body.applicationId)).run();
  }
  return (await getCollab(db, id))!;
}

/** Changes the terms. The page address (slug) never changes, so links already sent keep working. */
export async function updateCollab(db: D1Database, id: string, body: Record<string, unknown>, now: number): Promise<Collab> {
  const terms = parseCollabTerms(body);
  await assertUnique(db, terms, id);
  const res = await db
    .prepare(`UPDATE shop_collabs SET ${TERM_COLUMNS.map((k) => `${k} = ?`).join(', ')}, updatedAt = ? WHERE id = ?`)
    .bind(...termValues(terms), now, id)
    .run();
  if (!res.meta.changes) throw new AppError(404, 'This collab page no longer exists. Please reload the page.');
  return (await getCollab(db, id))!;
}

export async function setCollabDisabled(db: D1Database, id: string, disabled: boolean, now: number): Promise<void> {
  const res = await db.prepare('UPDATE shop_collabs SET disabledAt = ?, updatedAt = ? WHERE id = ?').bind(disabled ? now : null, now, id).run();
  if (!res.meta.changes) throw new AppError(404, 'This collab page no longer exists. Please reload the page.');
}

/** Only pages nobody accepted yet can be deleted (e.g. made by mistake); accepted ones can be switched off. */
export async function deleteCollab(db: D1Database, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM shop_collabs WHERE id = ? AND acceptedAt IS NULL').bind(id).run();
  if (!res.meta.changes) throw new AppError(409, 'This page was already accepted, so it cannot be deleted. Use “Switch off” instead.');
  await db.prepare('UPDATE shop_collab_applications SET collabId = NULL WHERE collabId = ?').bind(id).run();
}

export async function getCollab(db: D1Database, id: string): Promise<Collab | null> {
  const r = await db.prepare('SELECT * FROM shop_collabs WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return r ? toCollab(r) : null;
}

export async function getCollabBySlug(db: D1Database, slug: string): Promise<Collab | null> {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) return null;
  const r = await db.prepare('SELECT * FROM shop_collabs WHERE slug = ?').bind(slug).first<Record<string, unknown>>();
  return r ? toCollab(r) : null;
}

/** Newest first. */
export async function listCollabs(db: D1Database): Promise<Collab[]> {
  const { results } = await db.prepare('SELECT * FROM shop_collabs ORDER BY createdAt DESC LIMIT 500').all<Record<string, unknown>>();
  return results.map(toCollab);
}

// ---------------------------------------------------------------------------
// Public: accepting the offer (personal page) and signing up (general page). Messages in Indonesian.
// ---------------------------------------------------------------------------

export async function acceptCollab(db: D1Database, slug: string, body: Record<string, unknown>, now: number): Promise<Collab> {
  const collab = await getCollabBySlug(db, slug);
  if (!collab) throw new AppError(404, 'Halaman kerja sama tidak ditemukan.');
  if (collab.acceptedAt !== null) throw new AppError(409, 'Kerja sama ini sudah kamu setujui. Terima kasih!');
  if (collabClosed(collab, now)) throw new AppError(409, 'Penawaran ini sudah tidak berlaku. Silakan hubungi kami lewat WhatsApp.');
  if (body.agree !== true) throw new AppError(400, 'Centang persetujuan ketentuan kerja sama terlebih dahulu');
  const a: CollabAcceptance = {
    name: requireText(body.name, 'Nama lengkap', 100),
    whatsapp: normalizePhone(body.whatsapp),
    address: requireText(body.address, 'Alamat pengiriman', 500),
    bank: requireText(body.bank, 'Nama bank / e-wallet', 60),
    accountNumber: requireText(body.accountNumber, 'Nomor rekening', 40),
    accountName: requireText(body.accountName, 'Nama pemilik rekening', 100),
    message: optionalText(body.message, 500) ?? '',
  };
  if (!/^[\d\s.-]{5,40}$/.test(a.accountNumber)) throw new AppError(400, 'Nomor rekening hanya boleh berisi angka');
  const res = await db
    .prepare(
      `UPDATE shop_collabs SET acceptedAt = ?, acceptedName = ?, acceptedWhatsapp = ?, acceptedAddress = ?, acceptedBank = ?,
         acceptedAccountNumber = ?, acceptedAccountName = ?, acceptedMessage = ?, updatedAt = ?
       WHERE id = ? AND acceptedAt IS NULL`,
    )
    .bind(now, a.name, a.whatsapp, a.address, a.bank, a.accountNumber, a.accountName, a.message || null, now, collab.id)
    .run();
  if (!res.meta.changes) throw new AppError(409, 'Kerja sama ini sudah kamu setujui. Terima kasih!');
  return (await getCollab(db, collab.id))!;
}

export async function createApplication(db: D1Database, body: Record<string, unknown>, now: number): Promise<CollabApplication> {
  const platform = str(body.platform) as CollabPlatform;
  if (!COLLAB_PLATFORMS.includes(platform)) throw new AppError(400, 'Pilih Instagram atau TikTok');
  const handle = str(body.handle).trim().replace(/^@+/, '').replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/@?/i, '').replace(/[/?#].*$/, '');
  if (!/^[A-Za-z0-9._]{1,40}$/.test(handle)) throw new AppError(400, 'Username tidak valid (contoh: @jentis.kitchen)');
  const app: CollabApplication = {
    id: newId(),
    name: requireText(body.name, 'Nama', 100),
    platform,
    handle,
    followers: requireText(body.followers, 'Jumlah followers', 30),
    whatsapp: normalizePhone(body.whatsapp),
    city: optionalText(body.city, 60) ?? '',
    message: optionalText(body.message, 500) ?? '',
    collabId: null,
    createdAt: now,
  };
  await db
    .prepare(
      `INSERT INTO shop_collab_applications (id, name, platform, handle, followers, whatsapp, city, message, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(app.id, app.name, app.platform, app.handle, app.followers, app.whatsapp, app.city || null, app.message || null, now)
    .run();
  return app;
}

/** Sign-ups not hidden by the owner, newest first. */
export async function listApplications(db: D1Database): Promise<CollabApplication[]> {
  const { results } = await db
    .prepare('SELECT * FROM shop_collab_applications WHERE hiddenAt IS NULL ORDER BY createdAt DESC LIMIT 300')
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    id: str(r.id),
    name: str(r.name),
    platform: (COLLAB_PLATFORMS as readonly string[]).includes(str(r.platform)) ? (str(r.platform) as CollabPlatform) : 'instagram',
    handle: str(r.handle),
    followers: str(r.followers),
    whatsapp: str(r.whatsapp),
    city: str(r.city),
    message: str(r.message),
    collabId: r.collabId ? str(r.collabId) : null,
    createdAt: Number(r.createdAt),
  }));
}

export async function hideApplication(db: D1Database, id: string, now: number): Promise<void> {
  const res = await db.prepare('UPDATE shop_collab_applications SET hiddenAt = ? WHERE id = ?').bind(now, id).run();
  if (!res.meta.changes) throw new AppError(404, 'This sign-up no longer exists. Please reload the page.');
}

// ---------------------------------------------------------------------------
// Telegram (CMO bot) messages
// ---------------------------------------------------------------------------

const rupiah = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;

export function collabAcceptedMessage(c: Collab, adminUrl: string): string {
  const a = c.accepted!;
  return [
    `🤝 ${c.name}${c.handle ? ` (@${c.handle})` : ''} ACCEPTED the collab!`,
    '',
    `Name: ${a.name}`,
    `WhatsApp: ${a.whatsapp.replace(/^62/, '0')}`,
    `Send: ${c.freeProducts}`,
    `Address: ${a.address}`,
    ...(a.message ? [`Message: ${a.message}`] : []),
    '',
    `Next: create voucher ${c.voucherCode} (${c.codePercent}%, max ${rupiah(c.codeCap)}) in Website → Vouchers, then ship the products.`,
    `${adminUrl}/website-collabs`,
  ].join('\n');
}

export function collabApplicationMessage(a: CollabApplication, adminUrl: string): string {
  return [
    `✨ New influencer sign-up: ${a.name}`,
    `${PLATFORM_LABELS[a.platform]} @${a.handle} · ${a.followers} followers`,
    `WhatsApp: ${a.whatsapp.replace(/^62/, '0')}${a.city ? ` · ${a.city}` : ''}`,
    ...(a.message ? [`Message: ${a.message}`] : []),
    `${adminUrl}/website-collabs`,
  ].join('\n');
}
