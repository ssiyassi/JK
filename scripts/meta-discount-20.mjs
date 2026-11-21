// First-order discount 35% -> 20% (owner, 11 Nov 2026): every live ad gets a copy of its creative with "20%" in the
// text and the 20% images/video from marketing/creatives/2026-11-diskon-20, plus one line about the monthly 20% voucher.
// Re-runnable; IDs in marketing/campaigns/diskon-20-nov26.json.
//   node scripts/meta-discount-20.mjs dry      -> prints the new creatives, changes nothing
//   node scripts/meta-discount-20.mjs prepare  -> uploads images + video and creates the new creatives (ads unchanged)
//   node scripts/meta-discount-20.mjs switch   -> points every live ad at its new creative (goes to Meta review)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, post } from './meta-api.mjs';

const ROOT = new URL('../', import.meta.url);
const DIR = 'marketing/creatives/2026-11-diskon-20/';
const STATE = new URL('marketing/campaigns/diskon-20-nov26.json', ROOT);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const mode = process.argv[2];
const dry = mode === 'dry';

async function step(key, fn) {
  if (state[key]) return state[key];
  if (dry) return `<${key}>`;
  state[key] = await fn();
  save();
  console.log(`+ ${key}: ${state[key]}`);
  return state[key];
}
const uploadImage = (f) =>
  step(`image:${f}`, async () => Object.values((await post(`${AD_ACCOUNT}/adimages`, { bytes: readFileSync(new URL(DIR + f, ROOT)).toString('base64') })).images)[0].hash);
async function uploadVideo(f) {
  const id = await step(`video:${f}`, async () => (await post(`${AD_ACCOUNT}/advideos`, { name: 'Reel Diskon 20% 2026-11', source: new Blob([readFileSync(new URL(DIR + f, ROOT))]) })).id);
  if (dry) return id;
  for (let i = 0; i < 40; i++) {
    const v = await get(id, { fields: 'status' });
    if (v.status?.video_status === 'ready') return id;
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('video still processing');
}

const MONTHLY = 'Punya akun? Dapat voucher 20% lagi setiap bulan.';
const text = (s) => (typeof s === 'string' ? s.replace(/35%/g, '20%') : s);
// Main ad text: 35% -> 20%, and the monthly line just before the "*Maks…" footnote (or at the end).
function message(s) {
  const t = text(s);
  if (!t || t.includes(MONTHLY)) return t;
  const i = t.indexOf('\n*');
  return i >= 0 ? `${t.slice(0, i)}\n${MONTHLY}${t.slice(i)}` : `${t}\n${MONTHLY}`;
}
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const LINK_KEYS = ['link', 'message', 'name', 'description', 'caption', 'call_to_action', 'image_hash', 'multi_share_optimized', 'multi_share_end_card', 'attachment_style'];
const CARD_KEYS = ['link', 'name', 'description', 'image_hash', 'call_to_action'];
const VIDEO_KEYS = ['video_id', 'message', 'title', 'link_description', 'call_to_action', 'image_hash'];

/** Which 20% file replaces which picture, by ad name. */
function family(name) {
  if (/Carousel 4 kartu/.test(name)) return { card: 'carousel-4.png' };
  if (/Cara Masak/.test(name)) return { card: 'howto-s5.png' };
  if (/Resep/.test(name)) return { card: 'resep-s6.png' };
  if (/Testimoni Carousel/.test(name)) return { card: 'testimoni-s5.png' };
  if (/Carousel Masih Ingat/.test(name)) return { card: 'masih-ingat-s4.png', last: true };
  if (/Story Masih Ingat/.test(name)) return { single: 'masih-ingat-story.png' };
  if (/Hero Diskon/.test(name)) return { single: 'feed-discount.png' };
  if (/Testimoni Single/.test(name)) return { feed: 'testimoni-feed.png', story: 'testimoni-story.png' };
  if (/Reel Diskon/.test(name)) return { video: 'reel-2.mp4', cover: 'reel-2-cover.jpg' };
  return null;
}

async function newCreative(ad, c) {
  const f = family(ad.name);
  if (!f) throw new Error(`no 20% plan for ad ${ad.name}`);
  const oss = c.object_story_spec;
  const spec = { page_id: oss.page_id, instagram_user_id: oss.instagram_user_id };
  if (oss.link_data) {
    const ld = pick(oss.link_data, LINK_KEYS);
    ld.message = message(ld.message);
    ld.name = text(ld.name);
    ld.description = text(ld.description);
    if (oss.link_data.child_attachments) {
      const cards = oss.link_data.child_attachments;
      ld.child_attachments = [];
      for (let i = 0; i < cards.length; i++) {
        const card = pick(cards[i], CARD_KEYS);
        card.name = text(card.name);
        card.description = text(card.description);
        const swap = f.last ? i === cards.length - 1 : /35%/.test(cards[i].name ?? '');
        if (swap) card.image_hash = await uploadImage(f.card);
        ld.child_attachments.push(card);
      }
      if (!ld.child_attachments.some((x, i) => x.image_hash !== cards[i].image_hash)) throw new Error(`no card swapped in ${ad.name}`);
    }
    if (f.single) ld.image_hash = await uploadImage(f.single);
    spec.link_data = ld;
  }
  if (oss.video_data) {
    const vd = pick(oss.video_data, VIDEO_KEYS);
    vd.message = message(vd.message);
    vd.title = text(vd.title);
    vd.link_description = text(vd.link_description);
    vd.video_id = await uploadVideo(f.video);
    vd.image_hash = await uploadImage(f.cover);
    delete vd.image_url;
    spec.video_data = vd;
  }
  const body = { name: `${text(c.name).replace(/ 2026-1\d-\d\d-[0-9a-f]+$/, '')} · 20% 2026-11-11`, object_story_spec: spec };
  if (c.asset_feed_spec) {
    const a = JSON.parse(JSON.stringify(c.asset_feed_spec));
    a.bodies = a.bodies.map((b) => ({ text: message(b.text) }));
    a.titles = a.titles?.map((t) => ({ text: text(t.text) }));
    a.descriptions = a.descriptions?.map((t) => ({ text: text(t.text) }));
    for (const img of a.images) {
      const label = img.adlabels?.[0]?.name ?? '';
      img.hash = await uploadImage(/story/.test(label) ? f.story : f.feed);
      img.adlabels = img.adlabels?.map((l) => ({ name: l.name }));
    }
    for (const r of a.asset_customization_rules ?? []) if (r.image_label) r.image_label = { name: r.image_label.name };
    delete a.additional_data;
    body.asset_feed_spec = a;
  }
  if (c.degrees_of_freedom_spec) body.degrees_of_freedom_spec = c.degrees_of_freedom_spec;
  return body;
}

const ads = (await get(`${AD_ACCOUNT}/ads`, { fields: 'id,name,creative{id}', effective_status: JSON.stringify(['ACTIVE']), limit: 50 })).data;
const CFIELDS = 'name,object_story_spec,asset_feed_spec,degrees_of_freedom_spec';
for (const ad of ads) {
  const key = `creative:${ad.id}`;
  if (mode === 'switch') {
    if (!state[key]) throw new Error(`no new creative for ${ad.name}; run prepare first`);
    if (ad.creative.id === state[key]) {
      console.log(`= ${ad.name} already on 20%`);
      continue;
    }
    state[`old:${ad.id}`] = ad.creative.id;
    save();
    await post(ad.id, { creative: { creative_id: state[key] }, name: text(ad.name) });
    console.log(`switched ${ad.name} -> ${text(ad.name)}`);
    continue;
  }
  if (state[key]) {
    console.log(`= ${ad.name}: creative ${state[key]}`);
    continue;
  }
  const c = await get(ad.creative.id, { fields: CFIELDS });
  const body = await newCreative(ad, c);
  if (dry) {
    console.log(`\n# ${ad.name}\n${JSON.stringify(body, null, 1).slice(0, +(process.env.N || 1800))}`);
    continue;
  }
  state[key] = (await post(`${AD_ACCOUNT}/adcreatives`, body)).id;
  save();
  console.log(`+ ${ad.name}: creative ${state[key]}`);
}
