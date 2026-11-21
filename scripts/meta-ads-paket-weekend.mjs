// Paket Weekend ad sets (owner 16 Nov 2026): the Paket Hemat 3 Box can only be bought Thursday–Sunday on the website
// (shop_bundles.weekdays), so each weekend gets its own ad set with the real dates in the picture ("26–29 Nov saja!").
// Each runs Thursday 00:00 → Sunday 23:59 WIB at Rp50.000/day and Meta starts/stops it by itself (no manual on/off).
// Main campaign (Purchase), Instagram, same people as the main ad set (Jakarta + around, 25+), without Surabaya.
// No price, no Babi/Sapi (Paket exception: "gratis ongkir" + "hemat Rp200.000"). IDs in marketing/campaigns/ads-paket-weekend.json.
//   node scripts/meta-ads-paket-weekend.mjs create
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT));
const STATE = new URL('marketing/campaigns/ads-paket-weekend.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const first = JSON.parse(read('marketing/campaigns/first-kv-oct26.json'));
const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };

const MAIN_CAMPAIGN = '120250051616680619';
const MAIN_ADSET = '120250051623620619';
const DAILY = 50000;
const WEEKENDS = [
  { key: '2611', dates: '26–29 Nov', start: '2026-11-26T00:00:00+0700', end: '2026-11-29T23:59:00+0700' },
  { key: '0312', dates: '3–6 Des', start: '2026-12-03T00:00:00+0700', end: '2026-12-06T23:59:00+0700' },
  { key: '1012', dates: '10–13 Des', start: '2026-12-10T00:00:00+0700', end: '2026-12-13T23:59:00+0700' },
];
const link = (w) => `https://jentiskitchen.id/paket/paket-hemat-3-box?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=paket-weekend-${w.key}`;
const text = (w) => `Paket Weekend cuma ${w.dates}! ⏰\nPaket Hemat 3 Box: bebas pilih 3 rasa, hemat Rp200.000 + gratis ongkir. Full daging tanpa lemak, sudah berbumbu, tinggal panggang.\nPaket hanya bisa dipesan Kamis–Minggu di jentiskitchen.id.`;

async function step(key, fn) {
  if (state[key]) return state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}
const upload = (f) => step(`image:${f}`, async () => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: read(`marketing/creatives/2026-11-paket-weekend/${f}`).toString('base64') })).images)[0].hash);

if (process.argv[2] !== 'create') {
  console.error('usage: node scripts/meta-ads-paket-weekend.mjs create');
  process.exit(1);
}
const main = await get(MAIN_ADSET, { fields: 'targeting' });
const targeting = structuredClone(main.targeting);
targeting.geo_locations.cities = targeting.geo_locations.cities.filter((c) => c.name !== 'Surabaya');

for (const w of WEEKENDS) {
  const adset = await step(`adset:${w.key}`, async () =>
    (await post(`${AD_ACCOUNT}/adsets`, {
      name: `Paket Weekend ${w.dates} · Jakarta + sekitar · 25+ · Purchase`,
      campaign_id: MAIN_CAMPAIGN,
      daily_budget: DAILY,
      start_time: w.start,
      end_time: w.end,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { pixel_id: '640518473594074', custom_event_type: 'PURCHASE' },
      attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
      destination_type: 'WEBSITE',
      targeting,
      status: 'ACTIVE',
    })).id,
  );
  const feed = await upload(`${w.key}-feed.png`);
  const story = await upload(`${w.key}-story.png`);
  const creative = await step(`creative:${w.key}`, async () =>
    (await post(`${AD_ACCOUNT}/adcreatives`, {
      name: `Paket Weekend ${w.dates} · feed+story`,
      object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_USER_ID },
      asset_feed_spec: {
        images: [{ hash: feed, adlabels: [{ name: `pw_${w.key}_feed` }] }, { hash: story, adlabels: [{ name: `pw_${w.key}_story` }] }],
        bodies: [{ text: text(w) }],
        titles: [{ text: `Paket Weekend ${w.dates} saja` }],
        link_urls: [{ website_url: link(w) }],
        call_to_action_types: ['ORDER_NOW'],
        ad_formats: ['SINGLE_IMAGE'],
        optimization_type: 'PLACEMENT',
        asset_customization_rules: [
          { priority: 1, customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['story', 'reels'] }, image_label: { name: `pw_${w.key}_story` } },
          { priority: 2, customization_spec: { publisher_platforms: ['instagram'], instagram_positions: ['stream'] }, image_label: { name: `pw_${w.key}_feed` } },
        ],
      },
      degrees_of_freedom_spec: DEGREES,
    })).id,
  );
  await step(`ad:${w.key}`, async () => (await post(`${AD_ACCOUNT}/ads`, { name: `Paket Weekend ${w.dates}`, adset_id: adset, creative: { creative_id: creative }, status: 'ACTIVE' })).id);
  console.log(JSON.stringify(await get(adset, { fields: 'name,status,effective_status,daily_budget,start_time,end_time' })));
  console.log(JSON.stringify(await get(state[`ad:${w.key}`], { fields: 'name,status,effective_status' })));
}
