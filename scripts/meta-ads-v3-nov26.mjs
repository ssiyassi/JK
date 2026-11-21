// Six new ad concepts (owner approved the research plan 2026-11-11: different ideas, 9:16 versions, wording that leads
// with convenience/taste/real customers, the 20% near the end, "hemat sampai Rp100.000" as a test, real deadline before
// the days off). Each ad: feed 4:5 in feed, 9:16 in stories/reels. Created PAUSED in the main ad set; switched on only
// after the owner has seen them. IDs in marketing/campaigns/ads-v3-nov26.json.
//   node scripts/meta-ads-v3-nov26.mjs create   → uploads pictures, creates creatives + PAUSED ads
//   node scripts/meta-ads-v3-nov26.mjs on <names…>  → switches those ads ACTIVE
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const STATE = new URL('marketing/campaigns/ads-v3-nov26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const MAIN_ADSET = '120250051623620619';
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const link = (content) => `https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=${content}`;

const OFFER = 'Pembelian pertama di website diskon 20%, hemat sampai Rp100.000, langsung di checkout.*\nPunya akun? Dapat voucher 20% lagi setiap bulan.\n*Khusus produk.';
export const ADS = {
  praktis: {
    name: 'V3 Praktis · tinggal panggang',
    headline: 'Tinggal panggang, beres',
    text: 'Stok lauk di freezer, tinggal panggang. Dagingnya sudah berbumbu: cairkan, panaskan teflon tanpa minyak, panggang sampai empuk. Selesai. Full daging, tanpa lemak, 3-4 porsi makan per pack.',
  },
  ludes: {
    name: 'V3 Ludes · chat pelanggan',
    headline: 'Sekali coba, bikin nagih',
    text: '"Gila enak banget. Mau pesen lagi dong. Setengah kilo udah ludes 😂" Chat asli pelanggan kami. Full daging, tanpa lemak, sudah berbumbu dan tinggal panggang.',
  },
  menu: {
    name: 'V3 Menu · 1 stok banyak menu',
    headline: '1 stok, banyak menu',
    text: 'Satu stok di freezer, banyak ide makan: isi bakpao, burger dengan telur, atau nasi hangat dengan sambal matah. Dagingnya sudah dimarinasi, tinggal panggang.',
  },
  kualitas: {
    name: 'V3 Kualitas · full daging',
    headline: 'Full daging, tanpa lemak',
    text: 'Full daging khas dalam, tanpa lemak. Sudah dimarinasi sampai meresap, lembut dan tidak keras. Tinggal panggang di rumah, 3-4 porsi makan per pack.',
  },
  manis: {
    name: 'V3 Manis pas · chat pelanggan',
    headline: 'Lembut, manisnya pas',
    text: '"Daging nya lembut ga keras, yg manis nya pas bgt di lidah." Chat asli pelanggan kami. Full daging, tanpa lemak, sudah berbumbu dan tinggal panggang.',
  },
  libur: {
    name: 'V3 Libur · pengiriman terakhir 16 Nov',
    headline: 'Pengiriman terakhir 16 Nov',
    text: 'Isi freezer sebelum kami libur 🙏 Pengiriman terakhir Senin, 16 Nov: Jabodetabek pesan sebelum jam 14:00 hari itu, Surabaya (kurir) paling lambat Minggu, 15 Nov. Kami libur 17–24 Nov dan kirim lagi mulai 25 Nov. Stok dulu untuk seminggu, tinggal panggang kapan saja.',
  },
};

async function step(key, fn) {
  if (state[key]) return state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}
const upload = (f) => step(`image:${f}`, async () => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-11-v3/${f}`).toString('base64') })).images)[0].hash);

const mode = process.argv[2];
if (mode === 'create') {
  for (const [key, a] of Object.entries(ADS)) {
    const feed = await upload(`${key}-feed.png`);
    const story = await upload(`${key}-story.png`);
    const creative = await step(`creative:${key}`, async () =>
      (await post(`${AD_ACCOUNT}/adcreatives`, {
        name: `${a.name} · feed+story 2026-11-11`,
        object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_USER_ID },
        asset_feed_spec: {
          images: [{ hash: feed, adlabels: [{ name: `v3_${key}_feed` }] }, { hash: story, adlabels: [{ name: `v3_${key}_story` }] }],
          bodies: [{ text: `${a.text}\n${OFFER}` }],
          titles: [{ text: a.headline }],
          link_urls: [{ website_url: link(`v3-${key}`) }],
          call_to_action_types: ['ORDER_NOW'],
          ad_formats: ['SINGLE_IMAGE'],
          optimization_type: 'PLACEMENT',
          asset_customization_rules: [
            { priority: 1, customization_spec: { publisher_platforms: ['instagram', 'facebook'], instagram_positions: ['story', 'reels'], facebook_positions: ['story', 'facebook_reels'] }, image_label: { name: `v3_${key}_story` } },
            { priority: 2, customization_spec: { publisher_platforms: ['instagram', 'facebook'], instagram_positions: ['stream'], facebook_positions: ['feed'] }, image_label: { name: `v3_${key}_feed` } },
          ],
        },
        degrees_of_freedom_spec: DEGREES,
      })).id,
    );
    await step(`ad:${key}`, async () => (await post(`${AD_ACCOUNT}/ads`, { name: a.name, adset_id: MAIN_ADSET, creative: { creative_id: creative }, status: 'PAUSED' })).id);
  }
  for (const key of Object.keys(ADS)) console.log(key, JSON.stringify(await get(state[`ad:${key}`], { fields: 'name,status,effective_status' })));
} else if (mode === 'recreative') {
  // New text for one ad: a fresh creative (creatives can't be edited), then the PAUSED ad points at it.
  const key = process.argv[3];
  delete state[`creative:${key}`];
  save();
  process.argv[2] = 'create';
  console.log('run "create" again, then: node scripts/meta-ads-v3-nov26.mjs point', key);
} else if (mode === 'point') {
  const key = process.argv[3];
  await post(state[`ad:${key}`], { creative: { creative_id: state[`creative:${key}`] } });
  console.log(key, JSON.stringify(await get(state[`ad:${key}`], { fields: 'name,status,effective_status,creative{id}' })));
} else if (mode === 'on') {
  for (const key of process.argv.slice(3)) {
    await post(state[`ad:${key}`], { status: 'ACTIVE' });
    console.log(key, JSON.stringify(await get(state[`ad:${key}`], { fields: 'name,status,effective_status' })));
  }
} else {
  console.error('usage: node scripts/meta-ads-v3-nov26.mjs create | on <names…>');
  process.exit(1);
}
