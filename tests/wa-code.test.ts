import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waCode, withWaCode } from '../src/lib/shop/waCode.ts';

test('WhatsApp code: one letter per source', () => {
  assert.equal(waCode({ source: 'meta', campaign: 'first-kv-oct26', content: 'v3-libur' }), 'L');
  assert.equal(waCode({ source: 'meta', campaign: 'outer-cities-nov26', content: 'carousel-v2' }), 'K');
  assert.equal(waCode({ source: 'meta', campaign: 'retarget-testimoni', content: 'testimoni-single' }), 'R');
  assert.equal(waCode({ source: 'meta', campaign: 'first-kv-oct26', content: 'gym-b' }), 'F');
  assert.equal(waCode({ source: 'meta', campaign: 'first-kv-oct26', content: 'v3-paket' }), 'P');
  assert.equal(waCode({ source: 'meta', campaign: 'first-kv-oct26', content: 'testimoni-single' }), 'T');
  assert.equal(waCode({ source: 'meta', campaign: 'first-kv-oct26', content: 'v4-praktis' }), 'M');
  assert.equal(waCode({ source: 'google', campaign: 'search-nov26' }), 'S');
  assert.equal(waCode({ source: 'instagram', campaign: 'organic-oct26', content: 'link_in_bio' }), 'I');
  assert.equal(waCode({ source: 'instagram', campaign: 'owner-personal-nov26', content: 'ig_story' }), 'O');
  assert.equal(waCode({ source: 'threads', campaign: 'owner-personal' }), 'O');
  assert.equal(waCode({ source: 'affiliate', campaign: 'imamdqc' }), 'A');
  assert.equal(waCode(null), 'W');
});

test('WhatsApp code: added once at the end of the message', () => {
  const href = 'https://wa.me/6285215448802?text=Halo%20Customer%20Care';
  const once = withWaCode(href, 'L');
  assert.equal(new URL(once).searchParams.get('text'), 'Halo Customer Care #L');
  assert.equal(withWaCode(once, 'L'), once);
  assert.equal(new URL(withWaCode('https://wa.me/6285215448802', 'K')).searchParams.get('text'), 'Halo Jenti’s Kitchen #K');
});
