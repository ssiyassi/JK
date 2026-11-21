// 2026-10-22, approved by the owner: since guest checkout applies the 35% new-customer discount automatically, ads say
// "tanpa perlu daftar". Creates v2 of the three running ads (new text + updated images: ticket "Khusus Pembeli Baru",
// fine print without sign-up), switches them on and pauses the old versions — same ad set, same budget.
// Re-runnable: IDs in marketing/campaigns/no-signup-oct26.json. Run: node scripts/meta-refresh-no-signup.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const disc = JSON.parse(read('marketing/campaigns/discount-oct26.json'));
const STATE = new URL('marketing/campaigns/no-signup-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]}`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

const link = (content, path = '/') =>
  `https://jentiskitchen.id${path}?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=${content}`;
const FINE = '*Maks. potongan Rp100.000, khusus produk. Sekali per nomor HP/email.';
const DISCOUNT_TEXT = [
  '🔥 Diskon 35% untuk pembelian pertama — langsung terpakai di checkout, tanpa perlu daftar!*',
  'Daging BBQ marinasi siap panggang — full daging, tanpa lemak. Lebih nikmat dari AYCE, tanpa antre.',
  '',
  'Pilih rasa favoritmu: Manis atau Asin Gurih.',
  '',
  FINE,
].join('\n');
const TASTE_TEXT = [
  'Kangen BBQ AYCE tapi malas antre? 🔥',
  "Jenti's Kitchen hadir dengan daging BBQ marinasi siap panggang — full daging, tanpa lemak. Tinggal panggang atau goreng di rumah.",
  '',
  'Pilih rasa favoritmu: Manis atau Asin Gurih.',
  '',
  'Pembelian pertama diskon 35%, langsung di checkout — tanpa perlu daftar.*',
  FINE,
].join('\n');

const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const identity = { page_id: PAGE_ID, instagram_user_id: IG_USER_ID };
const uploadImage = async (p) => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: read(p).toString('base64') })).images)[0].hash;
const creative = async (name, spec) =>
  (await post(`${AD_ACCOUNT}/adcreatives`, { name, object_story_spec: { ...identity, ...spec }, degrees_of_freedom_spec: DEGREES })).id;
const ad = async (name, creativeId) => (await post(`${AD_ACCOUNT}/ads`, { name, adset_id: first.adset, creative: { creative_id: creativeId }, status: 'PAUSED' })).id;

const V2 = 'marketing/creatives/2026-10-discount-v2/';
const heroHash = await step('image_hero_v2', () => uploadImage(`${V2}feed-discount.png`));
const card4Hash = await step('image_card4_v2', () => uploadImage(`${V2}carousel-4.png`));
const coverHash = await step('image_reel_cover_v2', () => uploadImage(`${V2}reel-2-cover.jpg`));
const videoId = await step('video_reel_v2', async () =>
  (await post(`${AD_ACCOUNT}/advideos`, { source: new Blob([read(`${V2}reel-2.mp4`)], { type: 'video/mp4' }), name: 'reel-2-v2.mp4' })).id,
);
for (let i = 0; ; i++) {
  const s = (await get(videoId, { fields: 'status' })).status?.video_status;
  if (s === 'ready') break;
  if (s === 'error' || i > 40) throw new Error(`video ${videoId}: ${s}`);
  await new Promise((r) => setTimeout(r, 5000));
}

const heroCr = await step('creative_hero_v2', () =>
  creative('Hero Diskon 35% v2 tanpa daftar', {
    link_data: { image_hash: heroHash, link: link('hero-discount-v2'), message: DISCOUNT_TEXT, name: 'Diskon 35% pembelian pertama', description: 'Tanpa daftar, langsung di checkout', call_to_action: { type: 'ORDER_NOW', value: { link: link('hero-discount-v2') } } },
  }),
);
const reelCr = await step('creative_reel_v2', () =>
  creative('Reel Diskon 35% v2 tanpa daftar', {
    video_data: { video_id: videoId, image_hash: coverHash, message: DISCOUNT_TEXT, title: 'Diskon 35% pembelian pertama', link_description: 'Tanpa daftar, langsung di checkout', call_to_action: { type: 'ORDER_NOW', value: { link: link('reel-discount-v2') } } },
  }),
);
const cardTitles = ['Lebih puas, di rumah sendiri', 'Full daging, tanpa lemak', 'Manis atau Asin Gurih?', 'Diskon 35% pembeli baru*'];
const cardHashes = [first.image_carousel_1, first.image_carousel_2, first.image_carousel_3, card4Hash];
const carouselCr = await step('creative_carousel_v2', () =>
  creative('Carousel 4 kartu v2 tanpa daftar', {
    link_data: {
      link: link('carousel-v2'),
      message: TASTE_TEXT,
      multi_share_optimized: false,
      multi_share_end_card: false,
      child_attachments: cardHashes.map((hash, i) => ({ image_hash: hash, link: link('carousel-v2'), name: cardTitles[i], call_to_action: { type: 'ORDER_NOW', value: { link: link('carousel-v2') } } })),
    },
  }),
);

const heroAd = await step('ad_hero_v2', () => ad('Hero Diskon 35% v2', heroCr));
const reelAd = await step('ad_reel_v2', () => ad('Reel Diskon 35% v2', reelCr));
const carouselAd = await step('ad_carousel_v2', () => ad('Carousel 4 kartu v2', carouselCr));

// Switch: new versions on, old versions paused (owner approved 2026-10-22).
for (const id of [heroAd, reelAd, carouselAd]) await post(id, { status: 'ACTIVE' });
for (const id of [disc.ad_hero_discount, disc.ad_reel_discount, first.ad_carousel]) await post(id, { status: 'PAUSED' });

for (const id of [heroAd, reelAd, carouselAd, disc.ad_hero_discount, disc.ad_reel_discount, first.ad_carousel]) {
  const a = await get(id, { fields: 'name,status,effective_status,preview_shareable_link' });
  console.log(`${a.name} | ${a.status} | ${a.effective_status} | ${a.preview_shareable_link}`);
}
