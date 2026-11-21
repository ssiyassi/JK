// Images uploaded from the admin (banners, product photos), stored in D1 as base64.
import { AppError, newId, type D1Database } from '../core/d1.ts';

const MAX_BASE64 = 1_800_000; // ~1.3 MB image; the admin page resizes before uploading

export function parseImageDataUrl(dataUrl: unknown): { mimeType: string; data: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m) throw new AppError(400, 'The file must be a JPG, PNG or WebP image');
  if (m[2].length > MAX_BASE64) throw new AppError(413, 'The image is too large');
  return { mimeType: m[1], data: m[2] };
}

export async function saveMedia(db: D1Database, dataUrl: unknown, now: number): Promise<string> {
  const { mimeType, data } = parseImageDataUrl(dataUrl);
  const id = newId();
  await db.prepare('INSERT INTO shop_media (id, mimeType, data, createdAt) VALUES (?, ?, ?, ?)').bind(id, mimeType, data, now).run();
  return id;
}

export async function getMedia(db: D1Database, id: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const row = await db.prepare('SELECT mimeType, data FROM shop_media WHERE id = ?').bind(id).first<{ mimeType: string; data: string }>();
  if (!row) return null;
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mimeType: row.mimeType, bytes };
}

/** Removes an image nothing uses any more. */
export async function deleteMediaIfUnused(db: D1Database, id: string | null): Promise<void> {
  if (!id) return;
  await db
    .prepare(
      `DELETE FROM shop_media WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM shop_products WHERE imageMediaId = ?)
         AND NOT EXISTS (SELECT 1 FROM shop_banners WHERE imageMediaId = ? OR mobileImageMediaId = ?)
         AND NOT EXISTS (SELECT 1 FROM shop_payday_promo WHERE imageMediaId = ?)
         AND NOT EXISTS (SELECT 1 FROM shop_promo_photos WHERE imageMediaId = ? OR thumbMediaId = ?)`,
    )
    .bind(id, id, id, id, id, id, id)
    .run();
}
