import { AppError } from '../core/d1.ts';
import { deliveryFee, emptyQuantities, formatRupiah, type Cart, type CatalogItem, type LineItem } from './catalog.ts';
import type { Quantities } from '../core/d1.ts';
import { bundleLines, type Bundle } from './bundles.ts';

/** A bundle in the cart, already checked (parseCartBundles): the bundle and the product picked per slot. */
export interface PricedBundleInput {
  bundle: Bundle;
  picks: string[];
}

export interface PriceBreakdown {
  lines: LineItem[];
  stockQuantities: Quantities; // what the order takes from the admin inventory (stock products only)
  totalPacks: number;
  subtotal: number;
  voucherBase: number; // the part of the subtotal a voucher may discount (bundles without vouchers left out)
  discount: number;
  deliveryFee: number;
  total: number;
}

const MAX_PER_PRODUCT = 50;

/**
 * Reads {productId: qty, ...} from untrusted input. Unknown products are ignored (e.g. deleted since the cart was
 * filled); hidden products cannot be ordered.
 */
export function parseCart(input: unknown, catalog: CatalogItem[], allowEmpty = false): Cart {
  const src = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const cart: Cart = {};
  for (const item of catalog) {
    const raw = src[item.product];
    const n = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > MAX_PER_PRODUCT) throw new AppError(400, 'Jumlah produk tidak valid');
    if (n > 0) cart[item.product] = n;
  }
  // allowEmpty: the cart holds a bundle, so no loose products is fine.
  if (!Object.keys(cart).length && !allowEmpty) throw new AppError(400, 'Keranjang masih kosong');
  const hidden = catalog.filter((item) => !item.visible && cart[item.product]);
  if (hidden.length) throw new AppError(409, `${hidden.map((i) => i.name).join(', ')} sedang tidak tersedia. Silakan hapus dari keranjang.`);
  return cart;
}

/**
 * What a voucher takes off. percent: share of the product subtotal (fixedAmount null); fixedAmount: Rupiah off.
 * capAmount null = no cap; minOrder = product subtotal needed (0 or missing = none).
 */
export interface DiscountTerms {
  percent: number;
  fixedAmount?: number | null;
  capAmount: number | null;
  minOrder?: number;
}

/**
 * Discount applies to products only (never the delivery fee): percent of the subtotal rounded down, or a fixed
 * amount; never more than the cap or the subtotal. Nothing below the minimum order.
 */
export function discountFor(subtotal: number, voucher: DiscountTerms | null): number {
  if (!voucher) return 0;
  if (voucher.minOrder && subtotal < voucher.minOrder) return 0;
  const raw = voucher.fixedAmount ? voucher.fixedAmount : Math.floor((subtotal * voucher.percent) / 100);
  return Math.min(raw, voucher.capAmount ?? Infinity, subtotal);
}

/** "Diskon 10%" / "Diskon Rp 20.000". */
export function discountLabel(voucher: DiscountTerms): string {
  return voucher.fixedAmount ? `Diskon ${formatRupiah(voucher.fixedAmount)}` : `Diskon ${voucher.percent}%`;
}

/**
 * `city`: the city picked in the "Kota" dropdown (only when it is on); it sets the delivery fee (deliveryFee).
 * `bundles`: bundles in the cart (bundles.ts). Their packs come first as lines priced at their share of the bundle
 * price. A bundle with free delivery makes the whole order ship free; a bundle without vouchers is left out of what
 * the voucher discounts (voucherBase), and so is its price from a voucher's minimum order.
 */
export function priceCart(cart: Cart, voucher: DiscountTerms | null, catalog: CatalogItem[], city?: string, bundles: PricedBundleInput[] = []): PriceBreakdown {
  const lines: LineItem[] = [];
  const stockQuantities = emptyQuantities();
  bundles.forEach((b, i) => lines.push(...bundleLines(b.bundle, b.picks, catalog, String(i + 1))));
  for (const item of catalog) {
    const qty = cart[item.product] ?? 0;
    if (qty <= 0) continue;
    lines.push({ product: item.product, name: item.name, price: item.price, qty, stockColumn: item.stockColumn });
  }
  for (const l of lines) if (l.stockColumn) stockQuantities[l.stockColumn] = (stockQuantities[l.stockColumn] ?? 0) + l.qty;
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const voucherBase = subtotal - bundles.filter((b) => !b.bundle.voucherAllowed).reduce((sum, b) => sum + b.bundle.price, 0);
  const totalPacks = lines.reduce((sum, l) => sum + l.qty, 0);
  const discount = discountFor(voucherBase, voucher);
  const fee = bundles.some((b) => b.bundle.freeDelivery) ? 0 : deliveryFee(totalPacks, city);
  return { lines, stockQuantities, totalPacks, subtotal, voucherBase, discount, deliveryFee: fee, total: subtotal - discount + fee };
}

/** "Voucher code" of the guest new-customer discount (checkout, order page, emails); see new-customer.ts. */
export const NEW_CUSTOMER_CODE = 'PELANGGAN BARU';
