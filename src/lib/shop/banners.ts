// Homepage carousel banners, edited from the admin. Each banner has a desktop image (2126 × 740) and a mobile image (39:25).
import { AppError, newId, type D1Database } from '../core/d1.ts';
import { mediaUrl, type Banner } from './catalog.ts';
import { deleteMediaIfUnused, saveMedia } from './media.ts';

function imageUrl(mediaId: unknown, path: unknown): string {
  return mediaId ? mediaUrl(String(mediaId)) : String(path ?? '');
}

function mapBanner(r: Record<string, unknown>): Banner {
  const image = imageUrl(r.imageMediaId, r.imagePath);
  const mobileImage = imageUrl(r.mobileImageMediaId, r.mobileImagePath);
  return {
    id: String(r.id),
    image: image || mobileImage,
    mobileImage: mobileImage || image,
    badge: (r.badge as string | null) || null,
    title: String(r.title),
    subtitle: (r.subtitle as string | null) || null,
    active: Number(r.active) === 1,
    sortOrder: Number(r.sortOrder),
  };
}

export async function listBanners(db: D1Database, onlyActive: boolean): Promise<Banner[]> {
  const { results } = await db
    .prepare(`SELECT * FROM shop_banners ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sortOrder, createdAt`)
    .all<Record<string, unknown>>();
  return results.map(mapBanner);
}

function fields(body: Record<string, unknown>) {
  const str = (v: unknown, max: number, label: string) => {
    const t = typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '';
    if (t.length > max) throw new AppError(400, `${label} is too long (max ${max} characters)`);
    return t;
  };
  return {
    badge: str(body.badge, 30, 'Badge') || null,
    title: str(body.title, 80, 'Title'), // optional: a banner can be just a picture
    subtitle: str(body.subtitle, 140, 'Subtitle') || null,
    active: body.active === false ? 0 : 1,
  };
}

/** New banner: both images are required (`image` = desktop, `mobileImage` = mobile, as data URLs). */
export async function createBanner(db: D1Database, body: Record<string, unknown>, now: number): Promise<Banner> {
  const f = fields(body);
  if (!body.image) throw new AppError(400, 'Please choose the desktop banner image');
  if (!body.mobileImage) throw new AppError(400, 'Please choose the mobile banner image');
  const desktopId = await saveMedia(db, body.image, now);
  const mobileId = await saveMedia(db, body.mobileImage, now);
  const id = newId();
  const last = await db.prepare('SELECT COALESCE(MAX(sortOrder), 0) AS m FROM shop_banners').first<{ m: number }>();
  await db
    .prepare(
      `INSERT INTO shop_banners (id, badge, title, subtitle, imageMediaId, imagePath, mobileImageMediaId, mobileImagePath,
         active, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)`,
    )
    .bind(id, f.badge, f.title, f.subtitle, desktopId, mobileId, f.active, Number(last?.m ?? 0) + 1, now, now)
    .run();
  return (await listBanners(db, false)).find((b) => b.id === id)!;
}

/** Saves text and, optionally, a new desktop image (`image`) and/or mobile image (`mobileImage`). */
export async function updateBanner(db: D1Database, id: string, body: Record<string, unknown>, now: number): Promise<Banner> {
  const current = await db.prepare('SELECT * FROM shop_banners WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!current) throw new AppError(404, 'Banner not found');
  const f = fields(body);

  const old = {
    desktop: (current.imageMediaId as string | null) ?? null,
    mobile: (current.mobileImageMediaId as string | null) ?? null,
  };
  let desktop = { mediaId: old.desktop, path: (current.imagePath as string | null) ?? null };
  let mobile = { mediaId: old.mobile, path: (current.mobileImagePath as string | null) ?? null };
  if (body.image) desktop = { mediaId: await saveMedia(db, body.image, now), path: null };
  if (body.mobileImage) mobile = { mediaId: await saveMedia(db, body.mobileImage, now), path: null };

  await db
    .prepare(
      `UPDATE shop_banners SET badge = ?, title = ?, subtitle = ?, active = ?, imageMediaId = ?, imagePath = ?,
         mobileImageMediaId = ?, mobileImagePath = ?, updatedAt = ? WHERE id = ?`,
    )
    .bind(f.badge, f.title, f.subtitle, f.active, desktop.mediaId, desktop.path, mobile.mediaId, mobile.path, now, id)
    .run();
  if (old.desktop !== desktop.mediaId) await deleteMediaIfUnused(db, old.desktop);
  if (old.mobile !== mobile.mediaId) await deleteMediaIfUnused(db, old.mobile);
  return (await listBanners(db, false)).find((b) => b.id === id)!;
}

export async function deleteBanner(db: D1Database, id: string): Promise<void> {
  const current = await db
    .prepare('SELECT imageMediaId, mobileImageMediaId FROM shop_banners WHERE id = ?')
    .bind(id)
    .first<{ imageMediaId: string | null; mobileImageMediaId: string | null }>();
  if (!current) throw new AppError(404, 'Banner not found');
  await db.prepare('DELETE FROM shop_banners WHERE id = ?').bind(id).run();
  await deleteMediaIfUnused(db, current.imageMediaId);
  await deleteMediaIfUnused(db, current.mobileImageMediaId);
}

export async function moveBanner(db: D1Database, id: string, direction: 'up' | 'down', now: number): Promise<Banner[]> {
  const items = await listBanners(db, false);
  const i = items.findIndex((b) => b.id === id);
  if (i < 0) throw new AppError(404, 'Banner not found');
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= items.length) return items;
  [items[i], items[j]] = [items[j], items[i]];
  await db.batch(items.map((b, k) => db.prepare('UPDATE shop_banners SET sortOrder = ?, updatedAt = ? WHERE id = ?').bind(k + 1, now, b.id)));
  return listBanners(db, false);
}
