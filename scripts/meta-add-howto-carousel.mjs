// Experiment 1 (owner approved 2026-10-27): a second carousel "Cara masak 3 langkah" in the SAME ad set as the winning
// "Carousel 4 kartu v2" — no extra budget, Meta splits the Rp 70.000/day. Measure after 7 days and ≥ Rp 150.000 spend on
// the new ad: cost per paid order vs Carousel v2. IDs in marketing/campaigns/howto-carousel-oct26.json.
// Run: node scripts/meta-add-howto-carousel.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const STATE = new URL('marketing/campaigns/howto-carousel-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]}`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

const link = `https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=carousel-howto`;
// Creative rules: no price, no Babi/Sapi, no free delivery; existing 35% first-purchase discount with its cap.
const MESSAGE = [
  'Masak daging BBQ tanpa minyak? Bisa, cuma 3 langkah 🔥',
  '1️⃣ Cairkan dulu  2️⃣ Teflon panas, tanpa minyak  3️⃣ Panggang sampai empuk',
  '',
  'Daging BBQ marinasi siap panggang — full daging, tanpa lemak. Pilih rasa Manis atau Asin Gurih.',
  '',
  'Pembelian pertama diskon 35%, langsung di checkout — tanpa perlu daftar.*',
  '*Maks. potongan Rp100.000, khusus produk. Sekali per nomor HP/email.',
].join('\n');
const TITLES = ['Masak tanpa minyak? Bisa.', '1. Cairkan dulu', '2. Teflon panas, tanpa minyak', '3. Panggang sampai empuk', 'Diskon 35% pembeli baru*'];
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };

const hashes = [];
for (let i = 1; i <= 5; i++) {
  hashes.push(
    await step(`image_${i}`, async () => {
      const res = await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-10-howto/carousel-${i}.png`).toString('base64') });
      return Object.values(res.images)[0].hash;
    }),
  );
}
const creativeId = await step('creative', async () =>
  (await post(`${AD_ACCOUNT}/adcreatives`, {
    name: 'Carousel Cara Masak 3 Langkah · Okt 2026',
    object_story_spec: {
      page_id: PAGE_ID,
      instagram_user_id: IG_USER_ID,
      link_data: {
        link,
        message: MESSAGE,
        multi_share_optimized: false, // keep the step order
        multi_share_end_card: false,
        child_attachments: hashes.map((h, i) => ({ image_hash: h, link, name: TITLES[i], call_to_action: { type: 'ORDER_NOW', value: { link } } })),
      },
    },
    degrees_of_freedom_spec: DEGREES,
  })).id,
);
const adId = await step('ad', async () => (await post(`${AD_ACCOUNT}/ads`, { name: 'Carousel Cara Masak 3 Langkah', adset_id: first.adset, creative: { creative_id: creativeId }, status: 'ACTIVE' })).id);
const a = await get(adId, { fields: 'name,status,effective_status,preview_shareable_link' });
console.log(`${a.name} | ${a.status} | ${a.effective_status} | ${a.preview_shareable_link}`);
