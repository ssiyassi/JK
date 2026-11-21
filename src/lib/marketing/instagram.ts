// Automatic Instagram posts for @jentis.kitchen (owner, 2026-11-11: "do it automatically for me, I always forget").
// Posts are queued in instagram_posts (pictures in shop_media); every 15-minute run publishes the posts that are due,
// one at a time (feed posts and, since 14 Nov 2026, stories), through the Instagram Graph API with the system user token INSTAGRAM_PUBLISH_TOKEN (secret).
// Each post gets 3 tries (one per run); then it is marked FAILED and reported on the Reporting bot. A container id is
// saved before publishing, so a retry after a timeout checks Instagram first and never posts twice.
import type { D1Database } from '../core/d1.ts';

export const GRAPH = 'https://graph.facebook.com/v23.0';
export const MAX_POST_ATTEMPTS = 3;

export interface InstagramEnv {
  INSTAGRAM_PUBLISH_TOKEN?: string;
  INSTAGRAM_USER_ID?: string; // 17841401644118096 (@jentis.kitchen)
  SHOP_URL?: string;
}

export interface QueuedPost {
  id: string;
  scheduledAt: number;
  caption: string;
  mediaIds: string[];
  attempts: number;
  containerId: string | null;
  kind: 'FEED' | 'STORY'; // STORY: one picture, no caption (migration 0048)
}

export interface PostResult {
  id: string;
  ok: boolean;
  permalink?: string;
  error?: string;
  gaveUp?: boolean;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function instagramConfigured(env: InstagramEnv): boolean {
  return Boolean(env.INSTAGRAM_PUBLISH_TOKEN && env.INSTAGRAM_USER_ID);
}

async function graph(fetchFn: Fetch, token: string, path: string, params: Record<string, string>, method: 'GET' | 'POST'): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET' ? await fetchFn(`${GRAPH}/${path}?${body}`) : await fetchFn(`${GRAPH}/${path}`, { method: 'POST', body });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) throw new Error(`Instagram: ${json.error?.message ?? `HTTP ${res.status}`}${json.error?.code ? ` (code ${json.error.code})` : ''}`);
  return json;
}

/** Waits until Instagram has fetched and processed a container (pictures take a few seconds). */
async function waitFinished(fetchFn: Fetch, token: string, container: string, sleep: (ms: number) => Promise<void>): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const s = await graph(fetchFn, token, container, { fields: 'status_code,status' }, 'GET');
    if (s.status_code === 'FINISHED' || s.status_code === 'PUBLISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not use the picture: ${String(s.status ?? s.status_code)}`);
    await sleep(2000);
  }
  throw new Error('Instagram is still processing the pictures');
}

export async function duePosts(db: D1Database, now: number): Promise<QueuedPost[]> {
  const { results } = await db
    .prepare("SELECT id, scheduledAt, caption, mediaIds, attempts, containerId, kind FROM instagram_posts WHERE status = 'QUEUED' AND scheduledAt <= ? ORDER BY scheduledAt LIMIT 3")
    .bind(now)
    .all<{ id: string; scheduledAt: number; caption: string; mediaIds: string; attempts: number; containerId: string | null; kind: string | null }>();
  return results.map((r) => ({ ...r, kind: r.kind === 'STORY' ? 'STORY' : 'FEED', mediaIds: JSON.parse(r.mediaIds) as string[] }));
}

/** Publishes one post; returns its permalink. */
export async function publishPost(
  db: D1Database,
  env: InstagramEnv,
  post: QueuedPost,
  fetchFn: Fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ igMediaId: string | null; permalink: string | null }> {
  const token = env.INSTAGRAM_PUBLISH_TOKEN!;
  const user = env.INSTAGRAM_USER_ID!;
  const shop = (env.SHOP_URL || 'https://jentiskitchen.id').replace(/\/$/, '');
  const url = (id: string) => `${shop}/media/${id}`;
  if (!post.mediaIds.length || post.mediaIds.length > 10) throw new Error('A post needs 1 to 10 pictures');

  // A container from an earlier try that Instagram already published: done, never post twice.
  if (post.containerId) {
    const s = await graph(fetchFn, token, post.containerId, { fields: 'status_code' }, 'GET').catch(() => null);
    if (s?.status_code === 'PUBLISHED') return { igMediaId: null, permalink: null };
  }

  let container: string;
  if (post.kind === 'STORY') {
    if (post.mediaIds.length !== 1) throw new Error('A story needs exactly 1 picture');
    container = String((await graph(fetchFn, token, `${user}/media`, { image_url: url(post.mediaIds[0]), media_type: 'STORIES' }, 'POST')).id);
  } else if (post.mediaIds.length === 1) {
    container = String((await graph(fetchFn, token, `${user}/media`, { image_url: url(post.mediaIds[0]), caption: post.caption }, 'POST')).id);
  } else {
    const children: string[] = [];
    for (const m of post.mediaIds) children.push(String((await graph(fetchFn, token, `${user}/media`, { image_url: url(m), is_carousel_item: 'true' }, 'POST')).id));
    for (const c of children) await waitFinished(fetchFn, token, c, sleep);
    container = String((await graph(fetchFn, token, `${user}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }, 'POST')).id);
  }
  await db.prepare('UPDATE instagram_posts SET containerId = ? WHERE id = ?').bind(container, post.id).run();
  await waitFinished(fetchFn, token, container, sleep);
  const published = String((await graph(fetchFn, token, `${user}/media_publish`, { creation_id: container }, 'POST')).id);
  const info = await graph(fetchFn, token, published, { fields: 'permalink' }, 'GET').catch(() => ({}) as Record<string, unknown>);
  return { igMediaId: published, permalink: typeof info.permalink === 'string' ? info.permalink : null };
}

/** Every 15-minute run: publishes what is due. Results are for the Telegram messages. */
export async function publishDuePosts(db: D1Database, env: InstagramEnv, fetchFn: Fetch, now: number, sleep?: (ms: number) => Promise<void>): Promise<PostResult[]> {
  if (!instagramConfigured(env)) return [];
  const out: PostResult[] = [];
  for (const post of await duePosts(db, now)) {
    try {
      const r = await publishPost(db, env, post, fetchFn, sleep);
      await db
        .prepare("UPDATE instagram_posts SET status = 'POSTED', attempts = attempts + 1, igMediaId = ?, permalink = ?, error = NULL, postedAt = ? WHERE id = ?")
        .bind(r.igMediaId, r.permalink, now, post.id)
        .run();
      out.push({ id: post.id, ok: true, permalink: r.permalink ?? undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const gaveUp = post.attempts + 1 >= MAX_POST_ATTEMPTS;
      await db
        .prepare('UPDATE instagram_posts SET attempts = attempts + 1, error = ?, status = ? WHERE id = ?')
        .bind(message.slice(0, 500), gaveUp ? 'FAILED' : 'QUEUED', post.id)
        .run();
      out.push({ id: post.id, ok: false, error: message, gaveUp });
    }
  }
  return out;
}
