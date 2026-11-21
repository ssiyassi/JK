// The ad campaigns the Ads Report shows as cards, each with its own budget (owner, 2026-11-06). A Meta campaign belongs
// to a channel by its name; an order by the utm_campaign of its ad link (Google orders by their Google ad tag). Meta
// budgets are read from Meta at every sync (metaAds.ts fetchDailyBudget); Google's is set here (the Google Ads script
// sends results only). Colours: the report's fixed categorical order, so a channel keeps its colour in every report.
export interface Channel {
  id: string;
  name: string;
  what: string; // who it reaches
  color: string;
  campaign?: RegExp; // Meta campaign name
  utm?: string; // utm_campaign on its ad links
  google?: true;
  dailyBudget?: number; // Google only
  start?: string; // Google only: first day it ran (YYYY-MM-DD)
}

export const CHANNELS: Channel[] = [
  { id: 'main', name: 'Meta · Main ads', what: 'New customers · Jabodetabek + Surabaya', color: '#2a78d6', campaign: /first kv/i, utm: 'first-kv-oct26' },
  { id: 'retarget', name: 'Meta · Retargeting', what: 'Past customers list (win-back) · stopped for good 13 Nov', color: '#eb6834', campaign: /past customers/i, utm: 'past-customers-oct26' },
  { id: 'city', name: 'Meta · Outside city', what: '10 new cities by courier', color: '#1baf7a', campaign: /kota baru/i, utm: 'outer-cities-nov26' },
  { id: 'google', name: 'Google · Search', what: 'People searching on Google', color: '#eda100', google: true, dailyBudget: 30000, start: '2026-11-06' },
  { id: 'testimoni', name: 'Meta · Retarget Testimoni', what: 'Visitors not bought + Instagram engaged 30d', color: '#9b5de5', campaign: /testimoni/i, utm: 'retarget-testimoni' },
];
const GOOGLE = CHANNELS.find((c) => c.google)!;

/**
 * Orders the owner says came through a campaign although their link had no ad tag (e.g. the customer saw the ad and
 * the owner helped her order on WhatsApp). Order number → utm_campaign. The order's own data stays as it was.
 */
export const OWNER_CONFIRMED: Record<string, string> = {
  '061120260002': 'outer-cities-nov26', // Denpasar, 6 Nov 2026: saw the Outside city ad, ordered with the owner's help
  // Matched 14 Nov 2026 with Meta's own purchase results (7-day click / 1-day view, same day + same amount, only when
  // exactly one of our orders fits): the buyer saw or clicked an ad, then came via the Instagram bio link or directly.
  '241020260002': 'first-kv-oct26', // 24 Oct Rp220k direct · 1-day view of Carousel 4 kartu v2
  '311020260001': 'first-kv-oct26', // 31 Oct Rp480k Instagram bio · 1-day view of Carousel Cara Masak 3 Langkah
  '311020260002': 'first-kv-oct26', // 31 Oct Rp220k direct · click on Carousel 4 kartu v2
  '011120260001': 'first-kv-oct26', // 1 Nov Rp220k Instagram bio · click on Carousel 4 kartu v2
  '041120260002': 'first-kv-oct26', // 4 Nov Rp540k Instagram bio · click on Carousel 4 kartu v2
  '081120260002': 'outer-cities-nov26', // 8 Nov Rp245k direct · click on Reel Diskon 20% (outside city)
  '091120260001': 'first-kv-oct26', // 9 Nov Rp220k Instagram bio · click on Carousel Cara Masak 3 Langkah
  '121120260002': 'first-kv-oct26', // 12 Nov Rp256k direct · click on Testimoni Single (main)
  '141120260001': 'first-kv-oct26', // 14 Nov Rp700k Instagram bio · 1-day view of V3 Libur
  '141120260002': 'first-kv-oct26', // 14 Nov Rp256k Instagram bio · click on V3 Libur (within 7 days)
  '141120260003': 'first-kv-oct26', // 14 Nov Rp143k Instagram bio · saw V3 Libur (1-day view: Meta 843k = 700k + 143k)
  '151120260002': 'first-kv-oct26', // 15 Nov Rp400k Instagram bio · click on V3 Libur (within 7 days)
};

/** Meta campaigns that match no channel (a new campaign not added above yet). */
export const OTHER_META: Channel = { id: 'other', name: 'Meta · Other campaigns', what: 'Campaigns not grouped yet', color: '#8a7a6d' };

export const channelOfCampaign = (name: string | null | undefined): Channel =>
  CHANNELS.find((c) => c.campaign?.test(name ?? '')) ?? OTHER_META;

/** Where a paid order came from, for the report: a channel, or a source without ad spend. */
export function orderChannel(o: { campaign: string | null; fromGoogle: boolean; fromMeta: boolean; source: string }): { name: string; color: string; channel: Channel | null } {
  if (o.fromGoogle) return { name: 'Google', color: GOOGLE.color, channel: GOOGLE };
  const c = CHANNELS.find((ch) => ch.utm && ch.utm === o.campaign);
  if (c) return { name: c.name.replace(/^Meta · /, ''), color: c.color, channel: c };
  if (o.fromMeta) return { name: 'Meta ad (campaign unknown)', color: OTHER_META.color, channel: OTHER_META };
  if (o.source.startsWith('instagram')) return { name: 'Instagram (no ad)', color: '#a8a29e', channel: null };
  return { name: 'Direct / unknown', color: '#a8a29e', channel: null };
}
