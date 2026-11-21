// Shop rules and defaults. Products and banners themselves are edited in the admin (tables shop_products and
// shop_banners, see products.ts / banners.ts); the defaults below are only the built-in photos and fallbacks.
// Each product deducts from its own product column of the inventory (see core/products.ts).
import type { Quantities } from '../core/d1.ts';
import { COURIER_FEE, COURIER_FREE_FROM, isCourierCity } from './delivery-cities.ts';

export interface CatalogItem {
  product: string; // product id; for stock products the same as stockColumn (e.g. 'babiManis')
  stockColumn: string | null; // inventory column it takes stock from; null = website-only (older products), not stock-tracked
  shortName: string | null; // short name on the admin pages and in Telegram (null = name)
  boxValue: number; // boxes one pack counts as in an order's box counter (may be a decimal, e.g. 0.5)
  name: string;
  size: string;
  description: string;
  price: number; // IDR per pack
  compareAtPrice: number | null; // optional original price ("harga coret")
  image: string; // URL of the photo
  accent: string; // fallback colour if the photo cannot load
  visible: boolean;
  sortOrder: number;
}

/** Built-in photos and fallback colours of the four original products, used until a photo is uploaded in the admin. */
export const DEFAULT_PRODUCT_LOOK: Record<string, { image: string; accent: string }> = {
  babiManis: { image: '/shop/products/babi-manis.jpg', accent: '#b45309' },
  babiAsin: { image: '/shop/products/babi-asin.jpg', accent: '#9a3412' },
  sapiManis: { image: '/shop/products/sapi-manis.jpg', accent: '#a16207' },
  sapiAsin: { image: '/shop/products/sapi-asin.jpg', accent: '#7c2d12' },
};

/** Look for other products without an uploaded photo. */
export const WEBSITE_ONLY_ACCENT = '#9a3412';

/** One item of an order or cart, priced. */
export interface LineItem {
  product: string;
  name: string;
  price: number; // per pack (a bundle's packs: their share of the bundle price)
  qty: number;
  stockColumn: string | null;
  bundle?: LineBundle; // set when the pack is part of a bundle (bundles.ts)
}

/** The tag on every order line that came from a bundle. `key` tells two copies of the same bundle apart. */
export interface LineBundle {
  id: string;
  key: string;
  name: string;
  price: number; // the bundle's price (all its lines together)
  compareAt: number; // its "harga coret" (crossed-out total)
}

/** Cart / order quantities by product id. */
export type Cart = Record<string, number>;

/** Names used for orders placed before product names were saved with each order. */
export const DEFAULT_PRODUCT_NAMES: Record<string, string> = {
  babiManis: 'Babi Marinade Manis',
  babiAsin: 'Babi Marinade Asin Gurih',
  sapiManis: 'Sapi Marinade Manis',
  sapiAsin: 'Sapi Marinade Asin Gurih',
};

/** WhatsApp number customers reach with "Hubungi Kami" (international format, digits only). */
export const CONTACT_WHATSAPP = '6285215448802';
/** Google Business Profile "write a review" link (owner, 2026-10-22). Shown to customers once an order is delivered. */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CU9ZtAQxNVBZEAE/review';

/** WhatsApp link with the pre-filled message for an order. */
export function whatsappOrderLink(orderId: string): string {
  const text = `Halo Admin Jentis Kitchen, tolong cek orderan saya dong dengan order ID ${orderId}`;
  return `https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/**
 * Phone number for a wa.me link: digits only, with Indonesia's 62 in front (a leading 0 becomes 62,
 * "+62 812…" becomes "62812…", "812…" becomes "62812…").
 */
export function whatsappNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;
  return digits;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(text)}`;
}

/** WhatsApp reminder the admin sends from Website → Customers about the customer's monthly voucher. */
export function monthlyVoucherReminderMessage(name: string, v: { code: string; percent: number; capAmount: number; expiresAt: number | null }): string {
  const until = v.expiresAt
    ? `Berlaku sampai *${new Date(v.expiresAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}*. `
    : '';
  return [
    `Halo Kak *${name}* 👋, ini dari Jentis Kitchen.`,
    '',
    `Kakak punya voucher diskon *${v.percent}%* bulan ini (maks. *${formatRupiah(v.capAmount).replace(/\s/g, '')}*) dengan kode:`,
    `*${v.code}*`,
    '',
    `${until}Yuk pakai untuk pesanan berikutnya di *jentiskitchen.id*. Masukkan kode di halaman checkout, atau masuk ke akun Kakak dan pilih vouchernya. 😊`,
    '',
    'Terima kasih! 🙏',
  ].join('\n');
}

/** WhatsApp text a shopper sends from the cart bar / checkout (owner, 2026-11-13): their cart already typed, so a
 *  shopper who is unsure can ask instead of leaving. Only the product names and quantities, nothing personal. */
export function cartWhatsAppText(lines: { name: string; qty: number }[]): string {
  if (lines.length === 0) return 'Halo Jentis Kitchen, saya mau tanya soal pesanan di website.';
  return ['Halo Jentis Kitchen, saya mau pesan:', ...lines.map((l) => `- ${l.qty} x ${l.name}`), '', 'Bisa dibantu?'].join('\n');
}

/** Message the admin sends from the Website Orders page to confirm an order with the customer. */
export function orderConfirmationMessage(o: {
  customerName: string; // the order's recipient
  lines: { name: string; qty: number }[];
  address: string;
  deliveryDate: number | null;
}): string {
  const day = o.deliveryDate !== null ? formatDeliveryDate(o.deliveryDate) : 'tanggal yang akan kami konfirmasi';
  return [
    `Halo Kak ${o.customerName}, kami dari Jentis Kitchen ingin mengkonfirmasi pesanan kakak yang akan dikirimkan ke *${o.address}*`,
    `pada *${day}*`,
    '',
    'Dengan pesanan :',
    ...o.lines.map((l) => `- ${l.qty} x ${l.name}`),
    '',
    'Apakah sudah benar detail pesanannya kak?',
    'Terima kasih',
  ].join('\n');
}

/** Message the admin sends from the Website Orders page to ask how a shipped order was. */
export function orderFollowUpMessage(customerName: string): string {
  return [
    `Halo Kak ${customerName}, apakah sudah dicoba masak dan di makan kak orderannya kemarin?`,
    '',
    'Apakah kakak suka akan produknya? mungkin dari segi rasa / empuk dagingnya?',
  ].join('\n');
}

/** Public URL of a file in /public/shop. Static files are served before the middleware, so always use the /shop path. */
/** Standalone pages without the shop header and footer (reseller pages: nowhere else to go from there). */
export function isStandalonePage(pathname: string): boolean {
  return /\/(hadiah-reseller(\/foto)?|payday-promo|stamp)$/.test(pathname);
}

export function shopAsset(path: string): string {
  return `/shop${path}`;
}

/** Public URL of an image uploaded in the admin. */
export function mediaUrl(id: string): string {
  return `/shop/media/${id}`;
}

/**
 * Homepage banner images. Each banner has a desktop and a mobile version (the website switches at 1024 px wide).
 * Sizes are the recommended upload sizes shown in the admin; images are cropped from the centre to the ratio.
 */
export const BANNER_SIZES = {
  desktop: { width: 2126, height: 740, ratioLabel: '≈2.87 : 1' },
  mobile: { width: 1560, height: 1000, ratioLabel: '39 : 25 (≈1.56 : 1)' },
} as const;

export interface Banner {
  id: string;
  image: string; // URL of the desktop image (2126 × 740)
  mobileImage: string; // URL of the mobile image (39:25)
  badge: string | null;
  title: string; // "\n" starts a new line
  subtitle: string | null;
  active: boolean;
  sortOrder: number;
}

/**
 * Delivery: Rp 15.000 for a single pack, free for 2 packs or more. A courier city picked in the "Kota" dropdown:
 * Rp 25.000 below 4 packs, free from 4 (delivery-cities.ts).
 */
export function deliveryFee(totalPacks: number, city?: string): number {
  if (isCourierCity(city)) return totalPacks < COURIER_FREE_FROM ? COURIER_FEE : 0;
  return totalPacks === 1 ? 15000 : 0;
}

/** Packs needed for free delivery (Jakarta, Tangerang, Bekasi, Depok). */
export const FREE_DELIVERY_FROM = 2;

/** Packs needed for free delivery to this city. */
export const freeDeliveryFrom = (city?: string): number => (isCourierCity(city) ? COURIER_FREE_FROM : FREE_DELIVERY_FROM);


/** Manual payment details shown after checkout. Placeholder until a payment gateway is connected. */
export const PAYMENT_INSTRUCTIONS = {
  bank: 'BCA',
  accountNumber: '7610033339',
  accountName: 'Yuwono Chaiyadi',
  /** Optional QRIS image placed in /public; set to null to hide. */
  qrisImage: null as string | null,
};

export const VOUCHER_RULES = {
  WELCOME: { percent: 20, cap: 100000, label: 'Voucher selamat datang' }, // 35% until 2026-11-11 (owner: 20%, same as the monthly voucher)
  MONTHLY: { percent: 20, cap: 100000, label: 'Voucher bulanan' },
  REFERRAL: { percent: 25, cap: 100000, label: 'Voucher referral' },
} as const;
export type VoucherKind = keyof typeof VOUCHER_RULES;

export function emptyQuantities(): Quantities {
  return {};
}

export function cartCount(cart: Cart): number {
  return Object.values(cart).reduce((a, b) => a + b, 0);
}

export function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

/** "Jumat, 16 Oktober 2026" for a delivery date (stored as midnight UTC of the delivery day). */
export function formatDeliveryDate(deliveryDate: number): string {
  return new Date(deliveryDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
