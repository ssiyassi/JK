// Separate campaign for the new cities outside the current delivery area (owner asked 2026-11-03): 5 km around the
// centre of each city, own budget Rp 40.000/day, shipping paid by the owner. Same approved creatives as the main ads
// with one extra line naming the cities and own links (utm_campaign=outer-cities-nov26).
// Everything is created PAUSED; it is switched on only after the owner's "go" (scripts/meta-set-status.mjs).
// Re-runnable: IDs are saved in marketing/campaigns/outer-cities-nov26.json. Run: node scripts/meta-build-outer-cities.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, PIXEL_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const first = JSON.parse(readFileSync(new URL('marketing/campaigns/first-kv-oct26.json', ROOT), 'utf8'));
const STATE = new URL('marketing/campaigns/outer-cities-nov26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]} (already created)`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

const DAILY_BUDGET = 40_000;
const RADIUS_KM = 5;
// Centre of each city (OpenStreetMap)
const CENTRES = {
  'Bandung (Alun-alun)': [-6.92129, 107.60715],
  'Bogor (Alun-alun)': [-6.5951, 106.79141],
  'Semarang (Simpang Lima)': [-6.98932, 110.42358],
  'Yogyakarta (Malioboro)': [-7.79325, 110.36578],
  'Denpasar (Puputan)': [-8.65712, 115.21766],
  'Badung (Kuta)': [-8.72643, 115.17781],
  'Malang (Balai Kota)': [-7.97813, 112.6339],
  'Sidoarjo (Alun-alun)': [-7.44621, 112.71785],
  'Medan (Lapangan Merdeka)': [3.59032, 98.67866],
  'Palembang (Masjid Agung)': [-2.98794, 104.76033],
};

const link = (content) => `https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=outer-cities-nov26&utm_content=${content}`;
// No price, no Babi/Sapi, no free delivery (creative rules). The cities go right above the discount's small print.
const CITIES = '📦 Kini dikirim ke Bandung, Bogor, Semarang, Yogyakarta, Denpasar, Badung, Malang, Sidoarjo, Medan & Palembang.';
const withCities = (message) => message.replace('*Maks.', `${CITIES}\n\n*Maks.`).replace(/\n{3,}/g, '\n\n');

const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const identity = { page_id: PAGE_ID, instagram_user_id: IG_USER_ID };
const source = async (id) => (await get(id, { fields: 'object_story_spec' })).object_story_spec;

const campaignId = await step('campaign', async () =>
  (await post(`${AD_ACCOUNT}/campaigns`, {
    name: 'Jentis · Sales · Kota Baru · Nov 2026',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
    buying_type: 'AUCTION',
    is_adset_budget_sharing_enabled: false,
  })).id,
);

const adsetId = await step('adset', async () =>
  (await post(`${AD_ACCOUNT}/adsets`, {
    name: '10 kota · pusat kota 5 km · 25+ · Purchase',
    campaign_id: campaignId,
    status: 'PAUSED',
    daily_budget: DAILY_BUDGET,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    promoted_object: { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' },
    attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
    targeting: {
      geo_locations: {
        custom_locations: Object.entries(CENTRES).map(([name, [latitude, longitude]]) => ({ name, latitude, longitude, radius: RADIUS_KM, distance_unit: 'kilometer' })),
        location_types: ['home', 'recent'],
      },
      age_min: 25,
      age_max: 65,
      targeting_automation: { advantage_audience: 1 }, // same as the main ad set; the locations stay fixed
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'story', 'facebook_reels'],
      instagram_positions: ['stream', 'story', 'reels'],
    },
  })).id,
);

// The three best-known main ads, copied with the new line and links
const carousel = (await source('28662657563383918')).link_data;
const hero = (await source('4102309230070012')).link_data;
const reel = (await source('1759771975082806')).video_data;
const order = (url) => ({ type: 'ORDER_NOW', value: { link: url } });

const creatives = {
  creative_carousel: () => {
    const url = link('carousel-v2');
    return {
      name: 'Kota baru · Carousel 4 kartu',
      object_story_spec: {
        ...identity,
        link_data: {
          link: url,
          message: withCities(carousel.message),
          multi_share_end_card: false,
          multi_share_optimized: false,
          child_attachments: carousel.child_attachments.map((c) => ({ link: url, image_hash: c.image_hash, name: c.name, call_to_action: order(url) })),
        },
      },
    };
  },
  creative_hero: () => {
    const url = link('hero-discount-v2');
    return {
      name: 'Kota baru · Hero Diskon 35%',
      object_story_spec: { ...identity, link_data: { link: url, message: withCities(hero.message), name: hero.name, description: hero.description, image_hash: hero.image_hash, call_to_action: order(url) } },
    };
  },
  creative_reel: () => {
    const url = link('reel-discount-v2');
    return {
      name: 'Kota baru · Reel Diskon 35%',
      object_story_spec: { ...identity, video_data: { video_id: reel.video_id, title: reel.title, message: withCities(reel.message), link_description: reel.link_description, image_hash: reel.image_hash, call_to_action: order(url) } },
    };
  },
};
for (const [key, spec] of Object.entries(creatives)) {
  await step(key, async () => (await post(`${AD_ACCOUNT}/adcreatives`, { ...spec(), degrees_of_freedom_spec: DEGREES })).id);
}

for (const [key, name, creativeKey] of [
  ['ad_carousel', 'Carousel 4 kartu', 'creative_carousel'],
  ['ad_hero', 'Hero Diskon 35%', 'creative_hero'],
  ['ad_reel', 'Reel Diskon 35%', 'creative_reel'],
]) {
  await step(key, async () => (await post(`${AD_ACCOUNT}/ads`, { name, adset_id: adsetId, creative: { creative_id: state[creativeKey] }, status: 'PAUSED' })).id);
}
console.log('done — everything PAUSED');
