// Builds the first Meta Sales campaign (October 2026 KVs) in ad account 993257963827130 — everything PAUSED.
// Nothing spends until the owner says "go" and the campaign, ad set and ads are switched to ACTIVE.
// Re-runnable: every created ID is saved in marketing/campaigns/first-kv-oct26.json and reused on the next run.
// Run: node scripts/meta-build-first-campaign.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, IG_USER_ID, PAGE_ID, PIXEL_ID, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const KV = (f) => new URL(`marketing/creatives/2026-10-first-kv/${f}`, ROOT);
const STATE = new URL('marketing/campaigns/first-kv-oct26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');

async function step(key, fn) {
  if (state[key]) {
    console.log(`= ${key}: ${typeof state[key] === 'string' ? state[key] : 'done'} (already created)`);
    return state[key];
  }
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${typeof state[key] === 'string' ? state[key] : JSON.stringify(state[key])}`);
  return state[key];
}

const link = (content, path = '/') =>
  `https://jentiskitchen.id${path}?utm_source=meta&utm_medium=paid_social&utm_campaign=first-kv-oct26&utm_content=${content}`;

// Approved copy (marketing/creatives/2026-10-first-kv/COPY.md): no price, no Babi/Sapi, no free delivery.
const MESSAGE = [
  'Kangen BBQ AYCE tapi malas antre? 🔥',
  "Jenti's Kitchen hadir dengan daging BBQ marinasi siap panggang — full daging, tanpa lemak. Tinggal panggang atau goreng di rumah.",
  '',
  'Pilih rasa favoritmu: Manis atau Asin Gurih.',
  '',
  'Daftar akun di jentiskitchen.id dan dapatkan diskon 35% untuk pembelian pertama.*',
  '*Untuk akun baru, maks. potongan Rp100.000, khusus produk.',
].join('\n');
const HEADLINE = 'Lebih nikmat dari AYCE — di rumah';
const DESCRIPTION = 'Diskon 35% pembelian pertama*';

// Keep the approved text and images exactly as made: no AI text variations, generated backgrounds, music, overlays...
// Meta deprecated the single "standard enhancements" switch, so each feature is opted out one by one. Feature names
// change between API versions: the ones Meta does not know are dropped after a validate-only call (nothing created).
const ENHANCEMENTS = [
  'text_optimizations', 'description_automation', 'add_text_overlay', 'text_translation', 'image_templates', 'image_touchups',
  'image_uncrop', 'image_brightness_and_contrast', 'image_animation', 'image_background_gen', 'music', 'inline_comment',
  'enhance_cta', 'reveal_details_over_time', 'show_summary', 'show_destination_blurbs', 'site_extensions', 'product_extensions',
  'advantage_plus_creative', 'cv_transformation', 'video_highlight', 'replace_media_text', 'generate_ai_avatar',
];
let optOut = null;
async function enhancementsOptOut(spec) {
  if (optOut) return optOut;
  const accepted = [];
  for (const f of ENHANCEMENTS) {
    try {
      await post(`${AD_ACCOUNT}/adcreatives`, {
        name: 'validate',
        object_story_spec: spec,
        degrees_of_freedom_spec: { creative_features_spec: { [f]: { enroll_status: 'OPT_OUT' } } },
        execution_options: ['validate_only'],
      });
      accepted.push(f);
    } catch {
      /* unknown or not applicable feature in this API version */
    }
  }
  optOut = { creative_features_spec: Object.fromEntries(accepted.map((f) => [f, { enroll_status: 'OPT_OUT' }])) };
  state.enhancementsOptedOut = accepted;
  save();
  console.log(`  enhancements switched off: ${accepted.join(', ') || '(none accepted)'}`);
  return optOut;
}

async function uploadImage(file) {
  const bytes = readFileSync(KV(file)).toString('base64');
  const res = await post(`${AD_ACCOUNT}/adimages`, { bytes });
  return Object.values(res.images)[0].hash;
}

async function uploadVideo(file) {
  const res = await post(`${AD_ACCOUNT}/advideos`, {
    source: new Blob([readFileSync(KV(file))], { type: 'video/mp4' }),
    name: file,
  });
  return res.id;
}

async function waitForVideo(id) {
  for (let i = 0; i < 40; i++) {
    const v = await get(id, { fields: 'status' });
    const s = v.status?.video_status;
    if (s === 'ready') return;
    if (s === 'error') throw new Error(`video ${id} processing failed`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`video ${id} still processing; run again later`);
}

async function creative(name, spec) {
  const degrees = await enhancementsOptOut(spec);
  return (await post(`${AD_ACCOUNT}/adcreatives`, { name, object_story_spec: spec, degrees_of_freedom_spec: degrees })).id;
}

const identity = { page_id: PAGE_ID, instagram_user_id: IG_USER_ID };

// 1. Images and video
const heroHash = await step('image_feed_hero', () => uploadImage('feed-hero.png'));
const cardHashes = [];
for (let i = 1; i <= 4; i++) cardHashes.push(await step(`image_carousel_${i}`, () => uploadImage(`carousel-${i}.png`)));
const coverHash = await step('image_reel_cover', () => uploadImage('reel-1-cover.jpg'));
const videoId = await step('video_reel', () => uploadVideo('reel-1.mp4'));
await waitForVideo(videoId);

// 2. Campaign (PAUSED)
const campaignId = await step('campaign', async () =>
  (await post(`${AD_ACCOUNT}/campaigns`, {
    name: 'Jentis · Sales · First KV · Okt 2026',
    objective: 'OUTCOME_SALES',
    status: 'PAUSED',
    special_ad_categories: [],
    buying_type: 'AUCTION',
    is_adset_budget_sharing_enabled: false,
  })).id,
);

// 3. Ad set (PAUSED): Rp 70.000/day, Purchase on the Pixel, delivery area only
const adsetId = await step('adset', async () =>
  (await post(`${AD_ACCOUNT}/adsets`, {
    name: 'Jabodetabek + Surabaya · 25+ · Purchase',
    campaign_id: campaignId,
    status: 'PAUSED',
    daily_budget: 70000,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    promoted_object: { pixel_id: PIXEL_ID, custom_event_type: 'PURCHASE' },
    targeting: {
      geo_locations: {
        regions: [{ key: '1664' }], // DKI Jakarta
        cities: [
          { key: '957890' }, // Depok (city borders)
          { key: '994587', radius: 17, distance_unit: 'kilometer' }, // Tangerang + Tangerang Selatan (17 km = Meta's minimum radius)
          { key: '951390' }, // Bekasi (city borders)
          { key: '992951' }, // Surabaya (city borders)
        ],
        location_types: ['home', 'recent'],
      },
      age_min: 25,
      age_max: 65,
      targeting_automation: { advantage_audience: 1 },
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed', 'story', 'facebook_reels'],
      instagram_positions: ['stream', 'story', 'reels'],
    },
  })).id,
);

// 4. Creatives
const heroCreative = await step('creative_hero', () =>
  creative('Hero KV · Okt 2026', {
    ...identity,
    link_data: { image_hash: heroHash, link: link('hero'), message: MESSAGE, name: HEADLINE, description: DESCRIPTION, call_to_action: { type: 'ORDER_NOW', value: { link: link('hero') } } },
  }),
);
const cardTitles = ['Lebih puas, di rumah sendiri', 'Full daging, tanpa lemak', 'Manis atau Asin Gurih?', 'Diskon 35% akun baru*'];
const carouselCreative = await step('creative_carousel', () =>
  creative('Carousel 4 kartu · Okt 2026', {
    ...identity,
    link_data: {
      link: link('carousel', '/register'),
      message: MESSAGE,
      multi_share_optimized: false, // keep the cards in story order
      multi_share_end_card: false,
      child_attachments: cardHashes.map((hash, i) => ({
        image_hash: hash,
        link: link('carousel', i === 3 ? '/register' : '/'),
        name: cardTitles[i],
        call_to_action: { type: 'ORDER_NOW', value: { link: link('carousel', i === 3 ? '/register' : '/') } },
      })),
    },
  }),
);
const reelCreative = await step('creative_reel', () =>
  creative('Reel 14 detik · Okt 2026', {
    ...identity,
    video_data: { video_id: videoId, image_hash: coverHash, message: MESSAGE, title: HEADLINE, link_description: DESCRIPTION, call_to_action: { type: 'ORDER_NOW', value: { link: link('reel') } } },
  }),
);

// 5. Ads (PAUSED)
for (const [key, name, creativeId] of [
  ['ad_hero', 'Hero KV', heroCreative],
  ['ad_carousel', 'Carousel 4 kartu', carouselCreative],
  ['ad_reel', 'Reel 14 detik', reelCreative],
]) {
  await step(key, async () => (await post(`${AD_ACCOUNT}/ads`, { name, adset_id: adsetId, creative: { creative_id: creativeId }, status: 'PAUSED' })).id);
}

console.log('\nAll objects created PAUSED. Nothing is spending.');
