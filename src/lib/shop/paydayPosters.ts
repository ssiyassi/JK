// Log of the posters resellers make with "Buat Postermu di Sini" on jentiskitchen.id/payday-promo. The poster itself is
// drawn on the phone; only what was typed is saved here, for the list in Website → Payday.
import { AppError, type D1Database } from '../core/d1.ts';
import { requireText } from './util.ts';

export const POSTER_KINDS = { 'babi-sapi': 'Babi + Sapi', sapi: 'Sapi saja' } as const;
export type PosterKind = keyof typeof POSTER_KINDS;

export interface PaydayPoster {
  id: number;
  createdAt: number;
  name: string;
  phone: string;
  deliveryDate: string;
  kind: PosterKind;
}

export async function logPaydayPoster(db: D1Database, body: Record<string, unknown>, now: number): Promise<void> {
  const name = requireText(body.name, 'Nama', 40);
  const phone = requireText(body.phone, 'Nomor WhatsApp', 20);
  const deliveryDate = String(body.deliveryDate ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) throw new AppError(400, 'Tanggal delivery tidak valid');
  const kind = String(body.kind ?? '');
  if (!(kind in POSTER_KINDS)) throw new AppError(400, 'Jenis poster tidak valid');
  await db
    .prepare('INSERT INTO payday_posters (createdAt, name, phone, deliveryDate, kind) VALUES (?, ?, ?, ?, ?)')
    .bind(now, name, phone, deliveryDate, kind)
    .run();
}

/** Newest first. */
export async function listPaydayPosters(db: D1Database, limit = 300): Promise<PaydayPoster[]> {
  const { results } = await db.prepare('SELECT * FROM payday_posters ORDER BY createdAt DESC LIMIT ?').bind(limit).all<PaydayPoster>();
  return results ?? [];
}
