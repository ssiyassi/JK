// Recipe carousel "1 pack, 4 menu" (owner asked 2026-10-27 to prepare it as an ad, to compare which content brings the
// most visitors). Same ad set as the other ads, created PAUSED — switch on only after the owner's "go" with
// meta-set-status.mjs. Each recipe card opens its own recipe page (with add to cart). IDs in marketing/campaigns/resep-carousel-oct26.json.
// Run: node scripts/meta-add-resep-carousel.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const STATE = new URL('marketing/campaigns/resep-carousel-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]}`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

const UTM = 'utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=carousel-resep';
const link = `https://jentiskitchen.id/resep-tips?${UTM}`;
const recipe = (slug) => `https://jentiskitchen.id/resep-tips/${slug}?${UTM}`;
// Card links: hook → recipe list, one card per recipe page, voucher card → recipe list.
const LINKS = [
  link,
  recipe('nasi-goreng-babi-bbq'),
  recipe('babi-bbq-sambal-matah'),
  recipe('mantau-isi-daging-sapi-bbq'),
  recipe('tumis-buncis-daging-sapi-bbq'),
  link,
];
// Creative rules: no price, no Babi/Sapi, no free delivery; existing 35% first-purchase discount with its cap.
const MESSAGE = [
  'Bingung masak apa? 1 pack daging BBQ bisa jadi 4 menu baru 🔥',
  '1️⃣ Nasi goreng  2️⃣ Sambal matah  3️⃣ Mantau isi daging  4️⃣ Tumis buncis',
  '',
  'Panggang di teflon tanpa minyak, potong, campur — resep lengkapnya ada di website.',
  '',
  'Pembelian pertama diskon 35%, langsung di checkout — tanpa perlu daftar.*',
  '*Maks. potongan Rp100.000, khusus produk. Sekali per nomor HP/email.',
].join('\n');
const TITLES = ['1 pack, 4 menu baru', 'Nasi Goreng Daging BBQ', 'Daging BBQ Sambal Matah', 'Mantau isi Daging BBQ', 'Tumis Buncis Daging BBQ', 'Diskon 35% pembeli baru*'];
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };

const hashes = [];
for (let i = 1; i <= 6; i++) {
  hashes.push(
    await step(`image_${i}`, async () => {
      const res = await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-10-resep/carousel-${i}.png`).toString('base64') });
      return Object.values(res.images)[0].hash;
    }),
  );
}
const creativeId = await step('creative', async () =>
  (await post(`${AD_ACCOUNT}/adcreatives`, {
    name: 'Carousel Resep 1 Pack 4 Menu · Okt 2026',
    object_story_spec: {
      page_id: PAGE_ID,
      instagram_user_id: IG_USER_ID,
      link_data: {
        link,
        message: MESSAGE,
        multi_share_optimized: false, // keep the card order
        multi_share_end_card: false,
        child_attachments: hashes.map((h, i) => ({ image_hash: h, link: LINKS[i], name: TITLES[i], call_to_action: { type: 'LEARN_MORE', value: { link: LINKS[i] } } })),
      },
    },
    degrees_of_freedom_spec: DEGREES,
  })).id,
);
const adId = await step('ad', async () => (await post(`${AD_ACCOUNT}/ads`, { name: 'Carousel Resep 1 Pack 4 Menu', adset_id: first.adset, creative: { creative_id: creativeId }, status: 'PAUSED' })).id);
const a = await get(adId, { fields: 'name,status,effective_status,preview_shareable_link' });
console.log(`${a.name} | ${a.status} | ${a.effective_status} | ${a.preview_shareable_link}`);
