// Monthly Payday Promo: the public page jentiskitchen.id/payday-promo (poster + caption) and the WhatsApp message the
// owner sends each reseller from My Resellers. Edited in the admin under Website → Payday.
import { AppError, type D1Database } from '../core/d1.ts';
import { jakartaDateKey } from '../core/time.ts';
import { mediaUrl } from './catalog.ts';
import { deleteMediaIfUnused, saveMedia } from './media.ts';
import type { PaydayPromo } from './payday-text.ts';

export { paydayMessage, paydayMonth, paydayPeriod, type PaydayPromo } from './payday-text.ts';

export const PAYDAY_SITE = 'https://jentiskitchen.id';
export const PAYDAY_PATH = '/payday-promo';
const DEFAULT_POSTER = '/shop/reseller/payday-okt-2026.jpg';

export const DEFAULT_PAYDAY_CAPTION = [
  '3 box Rp400.000, bebas pilih varian apa saja.',
  'Babi Marinade dan Sapi Marinade, rasa Manis atau Asin Gurih.',
  'Daging 500 gram tanpa lemak, dibumbui resep keluarga khusus.',
  'Frozen food tahan lama, praktis siap dimasak.',
].join('\n');

export const DEFAULT_PAYDAY_TEMPLATE = [
  'Halo kak {{reseller name}}',
  'Kita udah mau masuk lagi nih ke Payday Promo bulan {{month}}',
  'Coba buka PO lagi yuk biar bisa dapet komisi dan reward bulananya lagi yang sekarang makin gampang dan menarik.',
  '{{link}}',
].join('\n');

const DEFAULTS: PaydayPromo = {
  image: DEFAULT_POSTER,
  imageMediaId: null,
  startDate: '2026-10-25',
  endDate: '2026-10-31',
  caption: DEFAULT_PAYDAY_CAPTION,
  whatsappTemplate: DEFAULT_PAYDAY_TEMPLATE,
  updatedAt: 0,
};

export async function getPaydayPromo(db: D1Database): Promise<PaydayPromo> {
  const r = await db.prepare(`SELECT * FROM shop_payday_promo WHERE id = 'current'`).first<Record<string, unknown>>();
  if (!r) return DEFAULTS;
  const mediaId = (r.imageMediaId as string | null) || null;
  return {
    image: mediaId ? mediaUrl(mediaId) : DEFAULT_POSTER,
    imageMediaId: mediaId,
    startDate: String(r.startDate),
    endDate: String(r.endDate),
    caption: String(r.caption),
    whatsappTemplate: String(r.whatsappTemplate),
    updatedAt: Number(r.updatedAt),
  };
}

/** The promo is over once the Jakarta day is after the end date. */
export function paydayEnded(p: Pick<PaydayPromo, 'endDate'>, now: number): boolean {
  return jakartaDateKey(now) > p.endDate;
}

/**
 * Link for WhatsApp. WhatsApp keeps a link's preview for a long time, so every save gets its own `?v=`: after a new
 * poster is uploaded, new messages show the new picture.
 */
export function paydayLink(p: Pick<PaydayPromo, 'updatedAt'>): string {
  return `${PAYDAY_SITE}${PAYDAY_PATH}?v=${p.updatedAt ? p.updatedAt.toString(36) : '1'}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, max: number, label: string): string {
  const t = typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
  if (!t) throw new AppError(400, `${label} is required`);
  if (t.length > max) throw new AppError(400, `${label} is too long (max ${max} characters)`);
  return t;
}

/** Saves the promo. `image` (a data URL) replaces the poster; leave it out to keep the current one. */
export async function savePaydayPromo(db: D1Database, body: Record<string, unknown>, now: number): Promise<PaydayPromo> {
  const startDate = String(body.startDate ?? '');
  const endDate = String(body.endDate ?? '');
  if (!DATE.test(startDate) || Number.isNaN(Date.parse(startDate))) throw new AppError(400, 'Please choose the start date');
  if (!DATE.test(endDate) || Number.isNaN(Date.parse(endDate))) throw new AppError(400, 'Please choose the end date');
  if (endDate < startDate) throw new AppError(400, 'The end date must be on or after the start date');
  const caption = text(body.caption, 1500, 'Caption');
  const whatsappTemplate = text(body.whatsappTemplate, 1500, 'WhatsApp message');

  const current = await getPaydayPromo(db);
  const imageMediaId = body.image ? await saveMedia(db, body.image, now) : current.imageMediaId;
  const updatedAt = Math.max(now, current.updatedAt + 1);
  await db
    .prepare(
      `INSERT INTO shop_payday_promo (id, imageMediaId, startDate, endDate, caption, whatsappTemplate, updatedAt)
       VALUES ('current', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET imageMediaId = excluded.imageMediaId, startDate = excluded.startDate,
         endDate = excluded.endDate, caption = excluded.caption, whatsappTemplate = excluded.whatsappTemplate,
         updatedAt = excluded.updatedAt`,
    )
    .bind(imageMediaId, startDate, endDate, caption, whatsappTemplate, updatedAt)
    .run();
  if (current.imageMediaId && current.imageMediaId !== imageMediaId) await deleteMediaIfUnused(db, current.imageMediaId);
  return getPaydayPromo(db);
}
