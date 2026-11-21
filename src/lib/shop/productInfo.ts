// Product facts for the product pages, the homepage FAQ and Google's structured data. Given by the owner on
// 2026-10-22; change them here only when the owner says the product changed.
import type { CatalogItem } from './catalog';
import { CONTACT_WHATSAPP, VOUCHER_RULES } from './catalog';
import { AREA_SERVED, SITE_NAME, SITE_URL } from './seo';

export type Meat = 'babi' | 'sapi';

/** URL part of a product page, e.g. "Sapi Marinade Manis" → "sapi-marinade-manis". */
export function productSlug(item: Pick<CatalogItem, 'name'>): string {
  return item.name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const productPath = (item: Pick<CatalogItem, 'name'>) => `/produk/${productSlug(item)}`;

/** Pork or beef, from the stock product key (babiManis…) or the name; null for products we know nothing about. */
export function meatOf(item: Pick<CatalogItem, 'product' | 'stockColumn' | 'name'>): Meat | null {
  const s = `${item.stockColumn ?? ''} ${item.product} ${item.name}`.toLowerCase();
  if (/babi|pork/.test(s)) return 'babi';
  if (/sapi|beef/.test(s)) return 'sapi';
  return null;
}

export const CUT = 'Daging khas dalam (tenderloin)';

/** Labels on every meat pack (owner, 2026-10-29): helps buyers see what one 500 g pack gives them. */
export const MEAT_LABELS: { icon: string; text: string; color: 'green' | 'blue' }[] = [
  { icon: '🍽️', text: '3-4 porsi makan', color: 'green' },
  { icon: '🥩', text: '100% tanpa lemak', color: 'blue' },
];
/** "Cepat habis" pill (owner, 2026-11-06): only on the 500 g packs that sell out first, shown before the other labels. */
export const HOT_PRODUCTS = new Set(['babiManis', 'sapiManis']);
export const HOT_LABEL = { icon: '🔥', text: 'Cepat habis', color: 'red' } as const;
export const MAIN_SEASONING = 'Kecap, gula, dan minyak';
export const ALLERGENS = 'Mengandung kedelai (dari kecap).';
export const STORAGE = [
  'Freezer: tahan hingga 2 bulan.',
  'Chiller / kulkas: tahan hingga 2 minggu.',
];
export const COOKING = [
  'Kalau dari freezer, cairkan dulu (misalnya pindahkan ke chiller/kulkas semalam).',
  'Panggang di wajan atau teflon — tidak perlu tambah minyak.',
  'Masak sampai tingkat empuk sesuai selera, lalu sajikan.',
];

export function halalNote(meat: Meat): string {
  return meat === 'babi'
    ? 'Produk ini mengandung babi (non-halal).'
    : 'Produk sapi kami belum bersertifikat halal. Peralatan produksi sapi dipisahkan dan diproduksi di hari yang berbeda dari produk babi.';
}

/** Homepage FAQ: answers to what people search for (Google autocomplete, 2026-10-22). */
export const FAQ: { q: string; a: string }[] = [
  { q: 'Daging marinasi tahan berapa lama di freezer?', a: 'Daging marinasi Jentis Kitchen tahan hingga 2 bulan di freezer.' },
  { q: 'Daging marinasi tahan berapa lama di kulkas (chiller)?', a: 'Di chiller atau kulkas, daging marinasi kami tahan hingga 2 minggu.' },
  { q: 'Bagaimana cara memasaknya?', a: COOKING.join(' ') },
  { q: 'Daging bagian apa yang dipakai?', a: 'Semua produk, babi maupun sapi, memakai daging khas dalam (tenderloin) — full daging, tanpa lemak.' },
  { q: 'Apa bumbunya?', a: `Bumbu utamanya ${MAIN_SEASONING.toLowerCase()}, tersedia rasa Manis dan Asin Gurih. ${ALLERGENS}` },
  { q: 'Apakah produknya halal?', a: `${halalNote('babi')} ${halalNote('sapi')}` },
  { q: 'Dikirim ke mana saja?', a: `Kami mengirim ke ${AREA_SERVED.slice(0, -1).join(', ')} dan ${AREA_SERVED[AREA_SERVED.length - 1]}. Pengiriman Senin sampai Sabtu.` },
  { q: 'Bagaimana cara bayarnya?', a: 'Pesan di website ini, lalu bayar online lewat QRIS (semua e-wallet dan m-banking).' },
  { q: 'Ada diskon untuk pembelian pertama?', a: `Ada. Pembelian pertama otomatis dapat diskon ${VOUCHER_RULES.WELCOME.percent}% di checkout — tanpa perlu daftar (maks. potongan Rp100.000, khusus produk, sekali per nomor HP/email). Setelah itu, akun terdaftar dapat voucher ${VOUCHER_RULES.MONTHLY.percent}% setiap bulan.` },
];

export function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** Product + breadcrumb structured data for a product page. */
export function productJsonLd(item: CatalogItem, siteUrl = SITE_URL) {
  const url = `${siteUrl}${productPath(item)}`;
  const image = item.image.startsWith('http') ? item.image : `${siteUrl}${item.image}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${url}#product`,
        name: item.name,
        description: item.description,
        image: [image],
        sku: item.product,
        brand: { '@type': 'Brand', name: SITE_NAME },
        offers: {
          '@type': 'Offer',
          url,
          priceCurrency: 'IDR',
          price: item.price,
          availability: item.visible ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
          seller: { '@type': 'Organization', name: SITE_NAME, telephone: `+${CONTACT_WHATSAPP}` },
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Beranda', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: item.name, item: url },
        ],
      },
    ],
  };
}
