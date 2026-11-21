import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { PRODUCT_STORIES, TESTIMONIAL_STORIES, productStoryHtml, storiesCaption, storiesForWeek, storyWeek, testimonialStoryHtml } from '../src/lib/marketing/resellerStories.ts';

test('reseller stories: week numbers start on Friday 20 Nov 2026 (WIB) and rotate', () => {
  assert.equal(storyWeek(Date.UTC(2026, 10, 20, 2)), 0); // Fri 09:00 WIB
  assert.equal(storyWeek(Date.UTC(2026, 10, 27, 2)), 1);
  assert.equal(storyWeek(Date.UTC(2026, 10, 1)), 0); // before the start: first pictures
  const a = storiesForWeek(0);
  const b = storiesForWeek(1);
  assert.notEqual(a.product.photo, b.product.photo);
  assert.notEqual(a.testimonial.chat, b.testimonial.chat);
  assert.equal(storiesForWeek(PRODUCT_STORIES.length).product, a.product);
});

test('reseller stories: every picture exists, ORDER NOW!!, no logo, price or Babi/Sapi', () => {
  for (const s of PRODUCT_STORIES) assert.ok(existsSync(`public/shop/status/${s.photo}`), s.photo);
  for (const s of TESTIMONIAL_STORIES) {
    assert.ok(existsSync(`public/shop/status/${s.chat}`), s.chat);
    assert.ok(existsSync(`public/shop/status/${s.photo}`), s.photo);
  }
  for (let w = 0; w < 12; w++) {
    const s = storiesForWeek(w);
    for (const html of [productStoryHtml('https://x/shop/status', s.product, s.theme), testimonialStoryHtml('https://x/shop/status', s.testimonial, s.theme)]) {
      assert.match(html, /ORDER NOW!!/);
      assert.doesNotMatch(html, /logo|Jentis|Rp ?\d|babi|sapi|gratis ongkir|rotate/i);
    }
    assert.doesNotMatch(storiesCaption(w, 'Friday'), /Rp ?\d|babi|sapi|gratis ongkir/i);
  }
});
