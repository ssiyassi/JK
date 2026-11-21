// Photos resellers can save on jentiskitchen.id/hadiah-reseller/foto, managed in Website → Promo Photos.
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { mediaUrl } from './catalog.ts';
import { deleteMediaIfUnused, saveMedia } from './media.ts';

export interface PromoPhoto {
  id: string;
  full: string;
  thumb: string;
  label: string;
}

function mapPhoto(r: Record<string, unknown>): PromoPhoto {
  const full = r.imageMediaId ? mediaUrl(String(r.imageMediaId)) : String(r.imagePath ?? '');
  const thumb = r.thumbMediaId ? mediaUrl(String(r.thumbMediaId)) : String(r.thumbPath ?? '') || full;
  return { id: String(r.id), full, thumb, label: String(r.label) };
}

export async function listPromoPhotos(db: D1Database): Promise<PromoPhoto[]> {
  const { results } = await db.prepare('SELECT * FROM shop_promo_photos ORDER BY sortOrder, createdAt').all<Record<string, unknown>>();
  return results.map(mapPhoto);
}

/** New photo at the end: `image` (full size) and `thumb` (small square) as data URLs, resized in the browser. */
export async function addPromoPhoto(db: D1Database, body: Record<string, unknown>, now: number): Promise<PromoPhoto> {
  if (!body.image) throw new AppError(400, 'Please choose a photo');
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : 'Foto produk';
  const imageId = await saveMedia(db, body.image, now);
  const thumbId = body.thumb ? await saveMedia(db, body.thumb, now) : null;
  const id = newId();
  const last = await db.prepare('SELECT COALESCE(MAX(sortOrder), 0) AS m FROM shop_promo_photos').first<{ m: number }>();
  await db
    .prepare(
      `INSERT INTO shop_promo_photos (id, imageMediaId, thumbMediaId, imagePath, thumbPath, label, sortOrder, createdAt)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)`,
    )
    .bind(id, imageId, thumbId, label, Number(last?.m ?? 0) + 1, now)
    .run();
  const row = await db.prepare('SELECT * FROM shop_promo_photos WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return mapPhoto(row!);
}

export async function removePromoPhoto(db: D1Database, id: string): Promise<void> {
  const row = await db.prepare('SELECT imageMediaId, thumbMediaId FROM shop_promo_photos WHERE id = ?').bind(id).first<{ imageMediaId: string | null; thumbMediaId: string | null }>();
  if (!row) throw new AppError(404, 'Photo not found');
  await db.prepare('DELETE FROM shop_promo_photos WHERE id = ?').bind(id).run();
  await deleteMediaIfUnused(db, row.imageMediaId);
  await deleteMediaIfUnused(db, row.thumbMediaId);
}
