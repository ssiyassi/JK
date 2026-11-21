// "Pelanggan datang dari" when the owner places an order for a customer: the letter is the WhatsApp code at the end of
// the customer's first message (waCode.ts), and the tags are ones waCode() maps back to that letter, so the order lands
// on the same ad / channel in the reports as if the customer had ordered through that link. Framework-free (also used
// in the browser).

export interface OwnerSource {
  code: string;
  label: string;
  /** utm tags saved as the order's attribution; none = no ad or link (W). */
  tags: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string };
}

export const OWNER_SOURCES: OwnerSource[] = [
  { code: 'L', label: 'Iklan Meta "Libur"', tags: { utm_source: 'meta', utm_campaign: 'first-kv-oct26', utm_content: 'libur' } },
  { code: 'K', label: 'Iklan Meta luar kota', tags: { utm_source: 'meta', utm_campaign: 'outer-cities-nov26' } },
  { code: 'R', label: 'Iklan Meta retargeting', tags: { utm_source: 'meta', utm_campaign: 'retarget-testimoni' } },
  { code: 'P', label: 'Iklan Meta "Paket Hemat"', tags: { utm_source: 'meta', utm_campaign: 'first-kv-oct26', utm_content: 'paket' } },
  { code: 'T', label: 'Iklan Meta "Testimoni"', tags: { utm_source: 'meta', utm_campaign: 'first-kv-oct26', utm_content: 'testimoni' } },
  { code: 'F', label: 'Iklan Meta gym (Fitness)', tags: { utm_source: 'meta', utm_campaign: 'first-kv-oct26', utm_content: 'gym' } },
  { code: 'M', label: 'Iklan Meta lainnya', tags: { utm_source: 'meta', utm_campaign: 'first-kv-oct26' } },
  { code: 'S', label: 'Iklan Google Search', tags: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'search' } },
  { code: 'I', label: 'Link bio Instagram', tags: { utm_source: 'instagram', utm_campaign: 'bio' } },
  { code: 'O', label: 'Story / Threads kamu sendiri', tags: { utm_source: 'threads', utm_campaign: 'owner-personal' } },
  { code: 'A', label: 'Affiliate / collab', tags: { utm_source: 'affiliate' } },
  { code: 'W', label: 'Tanpa kode / tidak tahu', tags: {} },
];

export const findOwnerSource = (code: unknown): OwnerSource | undefined => OWNER_SOURCES.find((s) => s.code === code);
