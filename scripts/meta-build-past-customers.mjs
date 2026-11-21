// Separate retargeting campaign for the owner's past customers (owner asked 2026-10-31): "Diskon 35% untuk pembelian
// pertama" at jentiskitchen.id — none of them has ordered on the website, so the promise holds. Own budget: Rp 500.000
// per week = Rp 71.000/day (Meta spends up to 7× the daily budget per Sunday–Saturday week). Only the customer list
// (scripts/meta-customer-list.mjs) sees it; website buyers (Pixel Purchase, 180 days) drop out automatically.
// Everything is created PAUSED; it is switched on only after the owner's "go".
// Re-runnable: IDs are saved in marketing/campaigns/customers-oct26.json. Run: node scripts/meta-build-past-customers.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, IG_USER_ID, PAGE_ID, PIXEL_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const FILE = (f) => new URL(`marketing/creatives/2026-10-discount-v2/${f}`, ROOT);
const first = JSON.parse(readFileSync(new URL('marketing/campaigns/first-kv-oct26.json', ROOT), 'utf8'));
const STATE = new URL('marketing/campaigns/customers-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

async function step(key, fn) {
  if (state[key]) return console.log(`= ${key}: ${state[key]} (already created)`), state[key];
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}

export const DAILY_BUDGET = 30_000; // owner 2026-10-31: Rp 30.000/day max (was 71.000 = Rp 500.000/week)

const link = (content) =>
  `https://jentiskitchen.id/?utm_source=meta&utm_medium=paid_social&utm_campaign=past-customers-oct26&utm_content=${content}`;

// No price, no Babi/Sapi, no free delivery (creative rules).
const MESSAGE = [
  '🔥 Diskon 35% untuk pembelian pertama di jentiskitchen.id!*',
  "Daging BBQ marinasi Jenti's Kitchen sekarang bisa dipesan langsung di website — full daging, tanpa lemak, siap panggang.",
  '',
  'Diskon langsung terpakai di checkout, tanpa perlu daftar.',
  '',
  '*Maks. potongan Rp100.000, khusus produk. Sekali per nomor HP/email.',
].join('\n');
const HEADLINE = 'Diskon 35% pembelian pertama';
const DESCRIPTION = 'Pesan langsung di jentiskitchen.id';

const DEGREES = { creative_features_spec: Object.fromEntries(first.enhancementsOptedOut.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
const identity = { page_id: PAGE_ID, instagram_user_id: IG_USER_ID };
const uploadImage = async (f) => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: readFileSync(FILE(f)).toString('base64') })).images)[0].hash;

// 1. Website buyers of the last 180 days: excluded, so a customer stops seeing the ad once they order.
await step('purchasers', async () =>
  (await post(`${AD_ACCOUNT}/customaudiences`, {
    name: 'Website purchasers 180d',
    description: 'Exclusion for the past-customers retargeting',
    prefill: true,
    rule: {
      inclusions: {
        operator: 'or',
        rules: [{ event_sources: [{ id: PIXEL_ID, type: 'pixel' }], retention_seconds: 180 * 86400, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'Purchase' }] } }],
      },
    },
  })).id,
);

// 2. Campaign (separate from the main one, own budget)
const campaignId = await step('campaign', async () =>
  (await post(`${AD_ACCOUNT}/campaigns`, {
    name: 'Jentis · Retarget · Past customers · Okt 2026',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
    buying_type: 'AUCTION',
    is_adset_budget_sharing_enabled: false,
  })).id,
);

// 3. Creatives: the approved 35% posters (feed 4:5 + story 9:16)
const feedHash = await step('image_feed', () => uploadImage('feed-discount.png'));
const storyHash = await step('image_story', () => uploadImage('story-discount.png'));
const creative = async (name, hash, content) =>
  (await post(`${AD_ACCOUNT}/adcreatives`, {
    name,
    object_story_spec: {
      ...identity,
      link_data: { image_hash: hash, link: link(content), message: MESSAGE, name: HEADLINE, description: DESCRIPTION, call_to_action: { type: 'ORDER_NOW', value: { link: link(content) } } },
    },
    degrees_of_freedom_spec: DEGREES,
  })).id;
const feedCreative = await step('creative_feed', () => creative('Past customers · Poster 35% feed', feedHash, 'poster-feed'));
const storyCreative = await step('creative_story', () => creative('Past customers · Poster 35% story', storyHash, 'poster-story'));

// 4. Ad set + ads: need the customer list (blocked until the owner accepts Meta's customer-list terms)
if (!state.audience) {
  console.log('… ad set waits for the customer list: run scripts/meta-customer-list.mjs after the terms are accepted');
  process.exit(0);
}
const adsetId = await step('adset', async () =>
  (await post(`${AD_ACCOUNT}/adsets`, {
    name: 'Past customers list · not bought on website · Purchase',
    campaign_id: campaignId,
    status: 'PAUSED',
    daily_budget: DAILY_BUDGET,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    promoted_object: { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' },
    targeting: {
      custom_audiences: [{ id: state.audience }],
      excluded_custom_audiences: [{ id: state.purchasers }],
      geo_locations: first.geo ?? {
        // same delivery area as the main ad set
        regions: [{ key: '1664' }],
        cities: [{ key: '957890' }, { key: '994587', radius: 17, distance_unit: 'kilometer' }, { key: '951390' }, { key: '992951' }],
        location_types: ['home', 'recent'],
      },
      age_min: 18,
      targeting_automation: { advantage_audience: 0 }, // only the list, no expansion
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'story', 'facebook_reels'],
      instagram_positions: ['stream', 'story', 'reels'],
    },
  })).id,
);
for (const [key, name, creativeId] of [
  ['ad_feed', 'Poster 35% · feed', feedCreative],
  ['ad_story', 'Poster 35% · story', storyCreative],
]) {
  await step(key, async () => (await post(`${AD_ACCOUNT}/ads`, { name, adset_id: adsetId, creative: { creative_id: creativeId }, status: 'PAUSED' })).id);
}
console.log('done — everything PAUSED');
