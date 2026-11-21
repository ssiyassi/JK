// Search engine and link-preview texts for the public shop (jentiskitchen.id), plus the structured data Google reads.
// Owner's creative rules apply here too: no price, no free-delivery line in the shop-wide title/description.
import { CONTACT_WHATSAPP } from './catalog';

export const SITE_URL = 'https://jentiskitchen.id';
export const SITE_NAME = 'Jentis Kitchen';
export const SITE_TITLE = 'Jentis Kitchen — Daging BBQ Marinasi Siap Panggang, Pesan Online';
export const SITE_DESCRIPTION =
  'Daging BBQ marinasi siap panggang dari Jentis Kitchen — full daging, tanpa lemak, tinggal panggang atau goreng di rumah. Pesan online, dikirim ke Jabodetabek & Surabaya.';
/** 1200×630 link preview (WhatsApp, Facebook, Google Discover). */
export const OG_IMAGE = '/shop/og/jentis-kitchen-og.jpg';

const INSTAGRAM = 'https://www.instagram.com/jentis.kitchen/';
export const AREA_SERVED = ['Jakarta', 'Depok', 'Tangerang', 'Tangerang Selatan', 'Bekasi', 'Surabaya'];

/** Organization + WebSite structured data for the homepage (schema.org JSON-LD). */
export function homeJsonLd(siteUrl = SITE_URL) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: `${siteUrl}/`,
        logo: `${siteUrl}/shop/brand/logo.png`,
        email: 'help@jentiskitchen.id',
        sameAs: [INSTAGRAM],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer service',
          telephone: `+${CONTACT_WHATSAPP}`,
          availableLanguage: ['Indonesian'],
        },
        areaServed: AREA_SERVED.map((name) => ({ '@type': 'City', name })),
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: `${siteUrl}/`,
        name: SITE_NAME,
        inLanguage: 'id-ID',
        publisher: { '@id': `${siteUrl}/#organization` },
      },
    ],
  };
}

/** JSON for a <script type="application/ld+json">, safe to put inside HTML. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
