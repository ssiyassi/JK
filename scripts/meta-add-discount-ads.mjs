// Adds the discount-first Hero KV and Reel (approved by the owner 2026-10-20) to the first campaign's ad set, PAUSED.
// The old taste-first Hero KV and Reel ads stay PAUSED (kept for history, never switched on); the Carousel stays as
// the taste-first comparison. Re-runnable: IDs are saved in marketing/campaigns/discount-oct26.json.
// Run: node scripts/meta-add-discount-ads.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const FILE = (f) => new URL(`marketing/creatives/2026-10-discount/${f}`, ROOT);
const first = JSON.parse(readFileSync(new URL('marketing/campaigns/first-kv-oct26.json', ROOT), 'utf8'));
const STATE = new URL('marketing/campaigns/discount-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]} (already created)`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

const link = (content, path = '/') =>
  `https://jentiskitchen.id${path}?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=${content}`;

// Approved copy: marketing/creatives/2026-10-discount/COPY.md
const MESSAGE = [
  '🔥 Diskon 35% untuk pembelian pertama di jentiskitchen.id!*',
  'Daging BBQ marinasi siap panggang — full daging, tanpa lemak. Lebih nikmat dari AYCE, tanpa antre.',
  '',
  'Pilih rasa favoritmu: Manis atau Asin Gurih.',
  'Daftar akun → voucher 35% langsung masuk → pakai saat checkout.',
  '',
  '*Untuk akun baru, maks. potongan Rp100.000, khusus produk.',
].join('\n');
const HEADLINE = 'Diskon 35% pembelian pertama';
const DESCRIPTION = 'Daging BBQ marinasi siap panggang';

// Same AI-enhancement opt-outs Meta accepted for the first creatives.
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const identity = { page_id: PAGE_ID, instagram_user_id: IG_USER_ID };

const uploadImage = async (f) => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: readFileSync(FILE(f)).toString('base64') })).images)[0].hash;

const heroHash = await step('image_feed_discount', () => uploadImage('feed-discount.png'));
const coverHash = await step('image_reel2_cover', () => uploadImage('reel-2-cover.jpg'));
const videoId = await step('video_reel2', async () =>
  (await post(`${AD_ACCOUNT}/advideos`, { source: new Blob([readFileSync(FILE('reel-2.mp4'))], { type: 'video/mp4' }), name: 'reel-2.mp4' })).id,
);
for (let i = 0; ; i++) {
  const s = (await get(videoId, { fields: 'status' })).status?.video_status;
  if (s === 'ready') break;
  if (s === 'error' || i > 40) throw new Error(`video ${videoId}: ${s}`);
  await new Promise((r) => setTimeout(r, 5000));
}

const creative = async (name, spec) =>
  (await post(`${AD_ACCOUNT}/adcreatives`, { name, object_story_spec: { ...identity, ...spec }, degrees_of_freedom_spec: DEGREES })).id;

const heroCreative = await step('creative_hero_discount', () =>
  creative('Hero Diskon 35% · Okt 2026', {
    link_data: { image_hash: heroHash, link: link('hero-discount'), message: MESSAGE, name: HEADLINE, description: DESCRIPTION, call_to_action: { type: 'ORDER_NOW', value: { link: link('hero-discount') } } },
  }),
);
const reelCreative = await step('creative_reel_discount', () =>
  creative('Reel Diskon 35% · Okt 2026', {
    video_data: { video_id: videoId, image_hash: coverHash, message: MESSAGE, title: HEADLINE, link_description: DESCRIPTION, call_to_action: { type: 'ORDER_NOW', value: { link: link('reel-discount') } } },
  }),
);

for (const [key, name, creativeId] of [
  ['ad_hero_discount', 'Hero Diskon 35%', heroCreative],
  ['ad_reel_discount', 'Reel Diskon 35%', reelCreative],
]) {
  await step(key, async () => (await post(`${AD_ACCOUNT}/ads`, { name, adset_id: first.adset, creative: { creative_id: creativeId }, status: 'PAUSED' })).id);
}

// Old taste-first Hero + Reel: make sure they stay paused (they are replaced by the discount versions).
for (const id of [first.ad_hero, first.ad_reel]) await post(id, { status: 'PAUSED' });

for (const id of [state.ad_hero_discount, state.ad_reel_discount, first.ad_carousel, first.ad_hero, first.ad_reel]) {
  const a = await get(id, { fields: 'name,status,effective_status,preview_shareable_link' });
  console.log(`${a.name} | ${a.status} | ${a.effective_status} | ${a.preview_shareable_link}`);
}
console.log('\nEverything PAUSED. Nothing is spending.');
