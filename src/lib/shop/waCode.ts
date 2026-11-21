// A one-letter code added to the end of the WhatsApp message a customer sends from the website (owner 15 Nov 2026:
// "put a symbol in every WhatsApp chat so I know where they came from without asking you"). Worked out from the ad /
// link tags of the visit, so new ads still get a letter. The legend is in WA_CODE_LEGEND (also shown to the owner).

type Tags = { source?: string | null; campaign?: string | null; content?: string | null };

export const WA_CODE_LEGEND: [string, string][] = [
  ['L', 'Meta ad "Libur"'],
  ['K', 'Meta ad for cities outside Jabodetabek (luar Kota)'],
  ['R', 'Meta retargeting (people who visited / follow you)'],
  ['P', 'Meta ad "Paket Hemat"'],
  ['T', 'Meta ad "Testimoni"'],
  ['F', 'Meta ad for gym people (Fitness)'],
  ['M', 'Any other Meta ad'],
  ['S', 'Google Search ad'],
  ['I', 'Your Instagram bio link'],
  ['O', 'Your own story / Threads links'],
  ['A', 'Affiliate or collab link'],
  ['W', 'No ad or link tag (typed the address, a saved link, another app)'],
];

export function waCode(t: Tags | null | undefined): string {
  const source = (t?.source ?? '').toLowerCase();
  const campaign = (t?.campaign ?? '').toLowerCase();
  const content = (t?.content ?? '').toLowerCase();
  if (source === 'meta' || source === 'facebook' || source === 'fb') {
    if (campaign.includes('outer-cities') || campaign.includes('kota')) return 'K';
    if (campaign.includes('retarget') || campaign.includes('past-customers')) return 'R';
    if (content.startsWith('gym')) return 'F';
    if (content.includes('libur')) return 'L';
    if (content.includes('paket')) return 'P';
    if (content.includes('testimoni')) return 'T';
    return 'M';
  }
  if (source === 'google') return 'S';
  if (source === 'affiliate' || source === 'collab') return 'A';
  if (campaign.includes('owner-personal') || source === 'threads') return 'O';
  if (source === 'instagram') return 'I';
  return 'W';
}

/** The wa.me link with " #<code>" added at the end of its message (a message is started if the link has none). */
export function withWaCode(href: string, code: string): string {
  try {
    const u = new URL(href);
    const text = u.searchParams.get('text') ?? '';
    if (/ #[A-Z]$/.test(text)) return href;
    // Built by hand with %20 (URLSearchParams writes "+", which some WhatsApp apps show as a plus sign).
    return `${u.origin}${u.pathname}?text=${encodeURIComponent(`${text || 'Halo Jenti’s Kitchen'} #${code}`)}`;
  } catch {
    return href;
  }
}
