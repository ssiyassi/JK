// v4 KV set (owner approved 14 Nov 2026 after the attention research: one big photo, one big hook, real chats big).
// Same ad text as v3 where the idea is the same; Bento is new (owner idea, for retargeting). Created PAUSED; switched on
// at the 23 Nov restart in place of the old v3 ads. IDs in marketing/campaigns/ads-v4-nov26.json.
//   node scripts/meta-ads-v4-nov26.mjs create   → uploads pictures, creates creatives + PAUSED ads
//   node scripts/meta-ads-v4-nov26.mjs on <names…>  → switches those ads ACTIVE
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const STATE = new URL('marketing/campaigns/ads-v4-nov26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const MAIN_ADSET = '120250051623620619';
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const link = (content) => `https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=${content}`;

const OFFER = 'Pembelian pertama di website diskon 20%, hemat sampai Rp100.000, langsung di checkout.*\nPunya akun? Dapat voucher 20% lagi setiap bulan.\n*Khusus produk.';
export const ADS = {
  praktis: { name: 'V4 Praktis · makan malam beres', headline: 'Makan malam beres', text: 'Stok lauk di freezer, tinggal panggang. Dagingnya sudah berbumbu: cairkan, panaskan teflon tanpa minyak, panggang sampai empuk. Selesai. Full daging, tanpa lemak, 3-4 porsi makan per pack.' },
  manis: { name: 'V4 Manis pas · chat pelanggan', headline: 'Lembut, manisnya pas', text: '"Daging nya lembut ga keras, yg manis nya pas bgt di lidah." Chat asli pelanggan kami. Full daging, tanpa lemak, sudah berbumbu dan tinggal panggang.' },
  kualitas: { name: 'V4 Kualitas · full daging tanpa lemak', headline: 'Full daging, tanpa lemak', text: 'Full daging khas dalam, tanpa lemak. Sudah dimarinasi sampai meresap, lembut dan tidak keras. Tinggal panggang di rumah, 3-4 porsi makan per pack.' },
  menu: { name: 'V4 Menu · hari ini bakpao', headline: 'Hari ini bakpao, besok burger', text: 'Satu stok di freezer, banyak ide makan: isi bakpao, burger dengan telur, atau nasi hangat dengan sambal matah. Dagingnya sudah dimarinasi, tinggal panggang.' },
  ludes: { name: 'V4 Ludes · chat pelanggan', headline: 'Setengah kilo ludes', text: '"Gila enak banget. Mau pesen lagi dong. Setengah kilo udah ludes 😂" Chat asli pelanggan kami. Full daging, tanpa lemak, sudah berbumbu dan tinggal panggang.' },
  anak: { name: 'V4 Anak susah makan · chat pelanggan', headline: 'Anak susah makan? Langsung habis', text: '"Enakkk banget. Anakku yg susah makan langsung makan 4 slice 🤣👌" Chat asli pelanggan kami. Full daging, tanpa lemak, empuk, sudah berbumbu dan tinggal panggang.', adset: '120250359719400619' },
  bento: { name: 'V4 Bento · menu simpel pasti nagih', headline: 'Menu simpel, pasti nagih', text: 'Nasi hangat + daging panggang, tinggal tambah telor. Bekal kerja, makan siang anak, atau makan malam cepat: dagingnya sudah berbumbu, tinggal panggang. Full daging, tanpa lemak, 3-4 porsi makan per pack.', adset: '120250359719400619' },
};

async function step(key, fn) {
  if (state[key]) return state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}
const upload = (f) => step(`image:${f}`, async () => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-11-v4/${f}`).toString('base64') })).images)[0].hash);

const mode = process.argv[2];
if (mode === 'create') {
  for (const [key, a] of Object.entries(ADS)) {
    const feed = await upload(`${key}-feed.png`);
    const story = await upload(`${key}-story.png`);
    const creative = await step(`creative:${key}`, async () =>
      (await post(`${AD_ACCOUNT}/adcreatives`, {
        name: `${a.name} · feed+story 2026-11-14`,
        object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_USER_ID },
        asset_feed_spec: {
          images: [{ hash: feed, adlabels: [{ name: `v4_${key}_feed` }] }, { hash: story, adlabels: [{ name: `v4_${key}_story` }] }],
          bodies: [{ text: a.noOffer ? a.text : `${a.text}\n${OFFER}` }],
          titles: [{ text: a.headline }],
          link_urls: [{ website_url: a.path ? `https://jentiskitchen.id${a.path}?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=v4-${key}` : link(`v4-${key}`) }],
          call_to_action_types: ['ORDER_NOW'],
          ad_formats: ['SINGLE_IMAGE'],
          optimization_type: 'PLACEMENT',
          asset_customization_rules: [
            { priority: 1, customization_spec: { publisher_platforms: ['instagram', 'facebook'], instagram_positions: ['story', 'reels'], facebook_positions: ['story', 'facebook_reels'] }, image_label: { name: `v4_${key}_story` } },
            { priority: 2, customization_spec: { publisher_platforms: ['instagram', 'facebook'], instagram_positions: ['stream'], facebook_positions: ['feed'] }, image_label: { name: `v4_${key}_feed` } },
          ],
        },
        degrees_of_freedom_spec: DEGREES,
      })).id,
    );
    await step(`ad:${key}`, async () => (await post(`${AD_ACCOUNT}/ads`, { name: a.name, adset_id: a.adset ?? MAIN_ADSET, creative: { creative_id: creative }, status: 'PAUSED' })).id);
  }
  for (const key of Object.keys(ADS)) console.log(key, JSON.stringify(await get(state[`ad:${key}`], { fields: 'name,status,effective_status' })));
} else if (mode === 'recreative') {
  // New text for one ad: a fresh creative (creatives can't be edited), then the PAUSED ad points at it.
  const key = process.argv[3];
  delete state[`creative:${key}`];
  save();
  process.argv[2] = 'create';
  console.log('run "create" again, then: node scripts/meta-ads-v4-nov26.mjs point', key);
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
  console.error('usage: node scripts/meta-ads-v4-nov26.mjs create | on <names…>');
  process.exit(1);
}
