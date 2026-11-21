// Affiliate programme constants safe for the browser (the sign-up form and the admin panel). Rules in affiliates.ts.
export const AFFILIATE_COMMISSION = 10_000;
export const AFFILIATE_PAYOUT_TEXT = 'setiap hari Minggu';

export const AFFILIATE_CHANNELS = ['instagram', 'tiktok', 'whatsapp', 'word_of_mouth'] as const;
export type AffiliateChannel = (typeof AFFILIATE_CHANNELS)[number];
/** Labels on the sign-up form (Indonesian). */
export const CHANNEL_LABELS: Record<AffiliateChannel, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  word_of_mouth: 'Dari mulut ke mulut',
};
/** Labels in the admin and the owner's Telegram (English). */
export const CHANNEL_LABELS_EN: Record<AffiliateChannel, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
  word_of_mouth: 'Word of mouth',
};
