// Gym ad set (owner 14 Nov 2026): KV B "Dear dada ayam rebus, kita putus ya" to reach NEW customers who work out.
// Runs 2 weeks only: 23 Nov 14:00 → 7 Dec 14:00 WIB at Rp30.000/day (≈ Rp420.000 total), then Meta stops it by itself.
// Inside the main campaign (Purchase), Instagram only like main, Jakarta + around (main geo without Surabaya),
// age 21–40, gym/fitness interests kept strict (Advantage+ audience off), website purchasers 180d excluded.
// No price, no Babi/Sapi, no free delivery in picture or text. IDs in marketing/campaigns/ads-gym-nov26.json.
//   node scripts/meta-ads-gym-nov26.mjs create   → uploads pictures, creates the ad set + ad (scheduled)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const STATE = new URL('marketing/campaigns/ads-gym-nov26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };

const MAIN_CAMPAIGN = '120250051616680619';
const START = '2026-11-23T14:00:00+0700';
const END = '2026-12-07T14:00:00+0700';
const DAILY = 30000;
const LINK = 'https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=gym-b';
const OFFER = 'Pembelian pertama di website diskon 20%, hemat sampai Rp100.000, langsung di checkout.*\n*Khusus produk.';
const TEXT = 'Dear dada ayam rebus, kita putus ya. 💔\nAnak gym wajib tau: sumber protein praktis yang ga bikin bosen. Daging marinasi, full daging tanpa lemak, sudah berbumbu. Ambil dari freezer, grill, makan. Tanpa meal prep, 3-4 porsi makan per pack.';
const INTERESTS = [
  ['6003648059946', 'Bodybuilding'], ['6003473077165', 'Weight training'], ['6003277229371', 'Physical fitness'],
  ['6003092532417', 'CrossFit'], ['6003327114145', 'Muscle & Fitness'], ['251115188565016', 'Gymshark'],
  ['6003283387551', "Gold's Gym"], ['6003331937771', 'Protein'],
];

async function step(key, fn) {
  if (state[key]) return state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}
const upload = (f) => step(`image:${f}`, async () => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-11-gym/${f}`).toString('base64') })).images)[0].hash);

if (process.argv[2] !== 'create') {
  console.error('usage: node scripts/meta-ads-gym-nov26.mjs create');
  process.exit(1);
}
const main = await get('120250051623620619', { fields: 'targeting' });
const geo = structuredClone(main.targeting.geo_locations);
geo.cities = geo.cities.filter((c) => c.name !== 'Surabaya');

const adset = await step('adset', async () =>
  (await post(`${AD_ACCOUNT}/adsets`, {
    name: 'Gym · Jakarta + sekitar · 21-40 · 2 minggu · Purchase',
    campaign_id: MAIN_CAMPAIGN,
    daily_budget: DAILY,
    start_time: START,
    end_time: END,
    optimization_goal: 'OFFSITE_CONVERSIONS',
    billing_event: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    promoted_object: { pixel_id: '640518473594074', custom_event_type: 'PURCHASE' },
    attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
    destination_type: 'WEBSITE',
    targeting: {
      age_min: 21,
      age_max: 40,
      geo_locations: geo,
      excluded_geo_locations: main.targeting.excluded_geo_locations,
      flexible_spec: [{ interests: INTERESTS.map(([id, name]) => ({ id, name })) }],
      excluded_custom_audiences: [{ id: '120250210888430619' }],
      targeting_automation: { advantage_audience: 0 },
      publisher_platforms: ['instagram'],
      instagram_positions: ['stream', 'story', 'reels'],
    },
    status: 'ACTIVE',
  })).id,
);
const feed = await upload('b-feed.png');
const story = await upload('b-story.png');
const creative = await step('creative', async () =>
  (await post(`${AD_ACCOUNT}/adcreatives`, {
    name: 'Gym B · putus sama dada ayam · feed+story 2026-11-14',
    object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_USER_ID },
    asset_feed_spec: {
      images: [{ hash: feed, adlabels: [{ name: 'gym_b_feed' }] }, { hash: story, adlabels: [{ name: 'gym_b_story' }] }],
      bodies: [{ text: `${TEXT}\n${OFFER}` }],
      titles: [{ text: 'Anak gym wajib tau' }],
      link_urls: [{ website_url: LINK }],
      call_to_action_types: ['ORDER_NOW'],
      ad_formats: ['SINGLE_IMAGE'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        { priority: 1, customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: 'gym_b_story' } },
        { priority: 2, customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['stream'] }, image_label: { name: 'gym_b_feed' } },
      ],
    },
    degrees_of_freedom_spec: DEGREES,
  })).id,
);
await step('ad', async () => (await post(`${AD_ACCOUNT}/ads`, { name: 'Gym B · putus sama dada ayam rebus', adset_id: adset, creative: { creative_id: creative }, status: 'ACTIVE' })).id);
console.log(JSON.stringify(await get(adset, { fields: 'name,status,effective_status,daily_budget,start_time,end_time,targeting{age_min,age_max,geo_locations,flexible_spec,excluded_custom_audiences}' })));
console.log(JSON.stringify(await get(state.ad, { fields: 'name,status,effective_status' })));
