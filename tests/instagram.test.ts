// Automatic Instagram posts (src/lib/marketing/instagram.ts). Run with: npm test
/* eslint-disable @typescript-eslint/no-explicit-any -- the sqlite test database stands in for D1 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqliteD1 } from './sqlite-d1.ts';
import { publishDuePosts } from '../src/lib/marketing/instagram.ts';

const env = { INSTAGRAM_PUBLISH_TOKEN: 'tok', INSTAGRAM_USER_ID: '178', SHOP_URL: 'https://jentiskitchen.id' };
const NOW = Date.parse('2026-11-12T12:00:00Z');
const noSleep = async () => {};

function freshDb() {
  const db = sqliteD1(join(mkdtempSync(join(tmpdir(), 'jentis-ig-')), 'test.db'));
  db.raw.exec(readFileSync(new URL('../migrations/0045_instagram_posts.sql', import.meta.url), 'utf8'));
  db.raw.exec(readFileSync(new URL('../migrations/0048_instagram_stories.sql', import.meta.url), 'utf8'));
  return db;
}
const queue = (db: ReturnType<typeof freshDb>, id: string, at: number, media: string[], extra = '') =>
  db.raw.prepare(`INSERT INTO instagram_posts (id, scheduledAt, caption, mediaIds, createdAt${extra ? ', containerId' : ''}) VALUES (?, ?, ?, ?, 0${extra ? ', ?' : ''})`).run(...[id, at, `cap ${id}`, JSON.stringify(media), ...(extra ? [extra] : [])]);
const row = (db: ReturnType<typeof freshDb>, id: string) => db.raw.prepare('SELECT * FROM instagram_posts WHERE id = ?').get(id) as Record<string, any>;

/** A fake Graph API that records the calls. */
function fakeGraph(opts: { failPublish?: boolean; containerStatus?: string } = {}) {
  const calls: { method: string; path: string; params: Record<string, string> }[] = [];
  let n = 0;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const params = Object.fromEntries((init?.body ? new URLSearchParams(String(init.body)) : u.searchParams).entries());
    const path = u.pathname.replace('/v23.0/', '');
    calls.push({ method: init?.method ?? 'GET', path, params });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (init?.method === 'POST' && path.endsWith('/media')) return json({ id: `c${++n}` });
    if (init?.method === 'POST' && path.endsWith('/media_publish')) return opts.failPublish ? json({ error: { message: 'boom', code: 2 } }, 500) : json({ id: 'ig1' });
    if (params.fields?.includes('status_code')) return json({ status_code: opts.containerStatus ?? 'FINISHED' });
    if (params.fields === 'permalink') return json({ permalink: 'https://www.instagram.com/p/abc/' });
    return json({ error: { message: 'unexpected' } }, 400);
  };
  return { calls, fetchFn };
}

test('a due single-picture post is published once with its caption and the public picture link', async () => {
  const db = freshDb();
  queue(db, 'p1', NOW - 1000, ['m1']);
  queue(db, 'later', NOW + 3600_000, ['m2']);
  const g = fakeGraph();
  const out = await publishDuePosts(db as any, env, g.fetchFn, NOW, noSleep);
  assert.deepEqual(out, [{ id: 'p1', ok: true, permalink: 'https://www.instagram.com/p/abc/' }]);
  const create = g.calls.find((c) => c.path === '178/media')!;
  assert.equal(create.params.image_url, 'https://jentiskitchen.id/media/m1');
  assert.equal(create.params.caption, 'cap p1');
  assert.equal(row(db, 'p1').status, 'POSTED');
  assert.equal(row(db, 'later').status, 'QUEUED');
  // Next run: nothing more to post.
  assert.deepEqual(await publishDuePosts(db as any, env, fakeGraph().fetchFn, NOW + 60_000, noSleep), []);
});

test('a carousel makes one item per picture, then one carousel with the caption', async () => {
  const db = freshDb();
  queue(db, 'c', NOW, ['a', 'b', 'c']);
  const g = fakeGraph();
  await publishDuePosts(db as any, env, g.fetchFn, NOW, noSleep);
  const creates = g.calls.filter((c) => c.method === 'POST' && c.path === '178/media');
  assert.equal(creates.length, 4);
  assert.ok(creates.slice(0, 3).every((c) => c.params.is_carousel_item === 'true' && !c.params.caption));
  assert.equal(creates[3].params.media_type, 'CAROUSEL');
  assert.equal(creates[3].params.children, 'c1,c2,c3');
  assert.equal(creates[3].params.caption, 'cap c');
  assert.equal(row(db, 'c').status, 'POSTED');
});

test('a failed post is tried 3 times, then FAILED and reported', async () => {
  const db = freshDb();
  queue(db, 'f', NOW, ['m']);
  for (let i = 1; i <= 3; i++) {
    const [r] = await publishDuePosts(db as any, env, fakeGraph({ failPublish: true }).fetchFn, NOW + i, noSleep);
    assert.equal(r.ok, false);
    assert.equal(r.gaveUp, i === 3);
  }
  assert.equal(row(db, 'f').status, 'FAILED');
  assert.match(row(db, 'f').error, /boom/);
  assert.deepEqual(await publishDuePosts(db as any, env, fakeGraph().fetchFn, NOW + 10, noSleep), []);
});

test('a retry whose container was already published does not post twice', async () => {
  const db = freshDb();
  queue(db, 'r', NOW, ['m'], 'c-old');
  const g = fakeGraph({ containerStatus: 'PUBLISHED' });
  const [r] = await publishDuePosts(db as any, env, g.fetchFn, NOW, noSleep);
  assert.equal(r.ok, true);
  assert.equal(g.calls.filter((c) => c.method === 'POST').length, 0);
  assert.equal(row(db, 'r').status, 'POSTED');
});

test('nothing happens without the publishing token', async () => {
  const db = freshDb();
  queue(db, 'p', NOW, ['m']);
  assert.deepEqual(await publishDuePosts(db as any, { INSTAGRAM_USER_ID: '178' }, fakeGraph().fetchFn, NOW, noSleep), []);
  assert.equal(row(db, 'p').status, 'QUEUED');
});

test('a story is one STORIES container with the picture and no caption', async () => {
  const db = freshDb();
  queue(db, 's1', NOW, ['st']);
  db.raw.prepare("UPDATE instagram_posts SET kind = 'STORY' WHERE id = 's1'").run();
  const g = fakeGraph();
  const [r] = await publishDuePosts(db as any, env, g.fetchFn, NOW, noSleep);
  assert.equal(r.ok, true);
  const creates = g.calls.filter((c) => c.method === 'POST' && c.path === '178/media');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].params.media_type, 'STORIES');
  assert.equal(creates[0].params.image_url, 'https://jentiskitchen.id/media/st');
  assert.equal(creates[0].params.caption, undefined);
  assert.equal(row(db, 's1').status, 'POSTED');
});
