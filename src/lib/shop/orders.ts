import {
  AppError,
  isUniqueViolation,
  newId,
  toDateOrNull,
  type D1Database,
  type D1PreparedStatement,
} from '../core/d1.ts';
import { findOperation, operationKeyStatement } from '../core/inventory.ts';
import { calculateBoxCounter, orderInsertStatements } from '../core/orders.ts';
import { loadStockProducts } from '../core/products.ts';
import { deliveryDateFromKey, WEBSITE_DELIVERY_CHOICES, websiteDeliveryOptions } from '../core/time.ts';
import { cityLeadDays, isDeliveryCity } from './delivery-cities.ts';
import { closedDeliveryDays } from './days-off.ts';
import { DEFAULT_PRODUCT_NAMES, type LineItem } from './catalog.ts';
import { findCustomerByEmail, getCustomer, isGuest, NO_PASSWORD, type Buyer, type Customer } from './customers.ts';
import { parseCart, priceCart, type PriceBreakdown, type PricedBundleInput } from './pricing.ts';
import { loadBundles, parseCartBundles } from './bundles.ts';
import { loadCatalog } from './products.ts';
import { displayPhone, normalizePhone, optionalText, randomCode, randomToken, requireText } from './util.ts';
import { assertNewCustomerDiscountFree, NEW_CUSTOMER_CODE, newCustomerGuardStatement, newCustomerUsedMessage, type Identity } from './new-customer.ts';
import { assertMinOrder, campaignGuardStatement, isVoucherLimitError } from './campaigns.ts';
import { findUsableVoucher, loadVoucherRules, type CheckoutVoucher } from './vouchers.ts';
import { findCourier, type CourierId } from './couriers.ts';
import type { WalletChannel } from './gateway.ts';

/** Reseller name used for every website order in the admin order list and reseller report. */
export const WEBSITE_RESELLER = 'Website';

export interface DeliveryAddress {
  recipientName: string;
  recipientPhone: string; // normalised 628...
  street: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** A website order. */
export interface ShopOrder extends DeliveryAddress {
  orderRowId: string;
  orderId: string; // the admin order number, e.g. 131020260007
  customerId: string;
  orderStatus: 'ACTIVE' | 'CANCELLED';
  paymentStatus: 'PENDING' | 'PAID';
  deliveryStatus: 'PENDING' | 'DELIVERED';
  lines: LineItem[]; // every item as bought (name and price at the time of the order)
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  voucherCode: string | null;
  proofUploadedAt: number | null;
  /** The admin who placed this order for the customer ("Buat pesanan untuk pelanggan"); null = the customer ordered. */
  placedByOwner: string | null;
  /** How the customer chose to pay: QRIS, OVO, ShopeePay or DANA (payment page), or TRANSFER (manual bank transfer + proof). Null = older order. */
  paymentMethod: PaymentMethod | null;
  paidAt: number | null; // when the payment was confirmed (the moment the order took its stock)
  shippedAt: number | null; // "Ship order" clicked in the admin (tracking link submitted)
  deliveredAt: number | null; // "Mark delivered" clicked in the admin
  trackingUrl: string | null; // delivery tracking link (TIKI, JNE: the courier's "cek resi" page)
  courier: CourierId | null; // picked with "Ship order" (couriers.ts); null = shipped before it was asked
  trackingNumber: string | null; // resi, TIKI and JNE only
  courierFee: number | null; // what the owner paid the courier (entered with "Ship order"), null = not entered
  cancelReason: 'EXPIRED' | 'ADMIN' | 'CUSTOMER' | null;
  deliveryDate: number | null; // delivery day, stored as midnight UTC of that day (null for orders from before it was set)
  createdAt: number;
  /** Placed without signing in: the secret of the guest's private order link. Null = placed by a signed-in customer. */
  guestKey: string | null;
  /** Email typed by the guest at checkout (null = none, or a signed-in order: use the account's email). */
  contactEmail: string | null;
  /** Used the new-customer discount (WELCOME voucher or the guest discount), see new-customer.ts. */
  newCustomerDiscount: boolean;
}

function mapShopOrder(r: Record<string, unknown>): ShopOrder {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    orderRowId: String(r.orderRowId),
    orderId: String(r.orderId),
    customerId: String(r.customerId),
    orderStatus: r.orderStatus as ShopOrder['orderStatus'],
    paymentStatus: r.paymentStatus as ShopOrder['paymentStatus'],
    deliveryStatus: r.deliveryStatus as ShopOrder['deliveryStatus'],
    recipientName: String(r.recipientName),
    recipientPhone: String(r.recipientPhone),
    street: String(r.street),
    kelurahan: String(r.kelurahan),
    kecamatan: String(r.kecamatan),
    city: String(r.city),
    notes: (r.notes as string | null) ?? null,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    lines: orderLines(r),
    subtotal: Number(r.subtotal),
    discount: Number(r.discount),
    deliveryFee: Number(r.deliveryFee),
    total: Number(r.total),
    voucherCode: (r.voucherCode as string | null) ?? null,
    proofUploadedAt: num(r.proofUploadedAt),
    placedByOwner: typeof r.placedByOwner === 'string' ? r.placedByOwner : null,
    paymentMethod: r.paymentMethod === 'QRIS' || r.paymentMethod === 'TRANSFER' || isWalletMethod(r.paymentMethod) ? r.paymentMethod : null,
    // Test (sandbox) orders take no stock, so their paid time comes from the payment.
    paidAt: r.paymentStatus === 'PAID' ? num(r.stockTakenAt ?? r.gatewayPaidAt) : null,
    shippedAt: num(r.shippedAt),
    deliveredAt: num(r.deliveredAt),
    trackingUrl: (r.trackingUrl as string | null) ?? null,
    courier: findCourier(r.courier)?.id ?? null,
    trackingNumber: (r.trackingNumber as string | null) ?? null,
    courierFee: num(r.courierFee),
    cancelReason: (r.cancelReason as ShopOrder['cancelReason']) ?? null,
    deliveryDate: toDateOrNull(r.deliveryDate)?.getTime() ?? null,
    createdAt: Number(r.createdAt),
    guestKey: (r.guestKey as string | null) ?? null,
    contactEmail: (r.contactEmail as string | null) ?? null,
    newCustomerDiscount: Number(r.newCustomerDiscount ?? 0) === 1,
  };
}

/** Line items of an order; orders from before website-only products are rebuilt from the four quantity columns. */
export function orderLines(r: Record<string, unknown>): LineItem[] {
  if (r.lineItems) return JSON.parse(String(r.lineItems)) as LineItem[];
  const prices = JSON.parse(String(r.unitPrices)) as Record<string, number>;
  const names = { ...DEFAULT_PRODUCT_NAMES, ...(r.itemNames ? (JSON.parse(String(r.itemNames)) as Record<string, string>) : {}) };
  return Object.keys(DEFAULT_PRODUCT_NAMES).filter((p) => Number(r[p]) > 0).map((p) => ({ product: p, name: names[p], price: prices[p], qty: Number(r[p]), stockColumn: p }));
}

const SHOP_ORDER_SELECT = `
  SELECT s.*, o.orderId, o.orderStatus, o.paymentStatus, o.deliveryStatus, o.deliveryDate, o.courierFee,
         (SELECT MAX(p.paidAt) FROM shop_payments p WHERE p.orderRowId = s.orderRowId AND p.status = 'SUCCESS') AS gatewayPaidAt,
         o.babiManis, o.babiAsin, o.sapiManis, o.sapiAsin, COALESCE(v.code, k.code, CASE WHEN s.newCustomerDiscount = 1 THEN '${NEW_CUSTOMER_CODE}' END) AS voucherCode
  FROM shop_orders s
  JOIN orders o ON o.id = s.orderRowId
  LEFT JOIN shop_vouchers v ON v.id = s.voucherId
  LEFT JOIN shop_voucher_codes k ON k.id = s.campaignCodeId`;

export async function getShopOrder(db: D1Database, orderRowId: string): Promise<ShopOrder | null> {
  const row = await db.prepare(`${SHOP_ORDER_SELECT} WHERE s.orderRowId = ?`).bind(orderRowId).first<Record<string, unknown>>();
  return row ? mapShopOrder(row) : null;
}

/** Who is looking at an order: the signed-in customer, and the guest key this browser saved for the order. */
export interface OrderViewer {
  customerId: string | null;
  guestKey: string | null;
}

/** The account the order belongs to, or the browser (or email link) of the guest who placed it. */
export function canViewOrder(order: ShopOrder, viewer: OrderViewer): boolean {
  if (viewer.customerId && order.customerId === viewer.customerId) return true;
  return order.guestKey !== null && viewer.guestKey === order.guestKey;
}

export const asViewer = (v: OrderViewer | string): OrderViewer => (typeof v === 'string' ? { customerId: v, guestKey: null } : v);

export async function listCustomerOrders(db: D1Database, customerId: string): Promise<ShopOrder[]> {
  const { results } = await db
    .prepare(`${SHOP_ORDER_SELECT} WHERE s.customerId = ? ORDER BY s.createdAt DESC LIMIT 50`)
    .bind(customerId)
    .all<Record<string, unknown>>();
  return results.map(mapShopOrder);
}

export async function listWebsiteOrders(
  db: D1Database,
  limit = 200,
): Promise<(ShopOrder & { customerEmail: string; customerName: string; paidInvoice: string | null; paidVia: string | null })[]> {
  const { results } = await db
    .prepare(
      `SELECT x.*, c.email AS customerEmail, c.name AS customerName,
         (SELECT p.invoiceNumber FROM shop_payments p WHERE p.orderRowId = x.orderRowId AND p.status = 'SUCCESS' LIMIT 1) AS paidInvoice,
         (SELECT p.gateway FROM shop_payments p WHERE p.orderRowId = x.orderRowId AND p.status = 'SUCCESS' LIMIT 1) AS paidVia
       FROM (${SHOP_ORDER_SELECT}) x
       LEFT JOIN shop_customers c ON c.id = x.customerId
       -- Test account orders (Duitku sandbox) stay out of the admin.
       WHERE NOT EXISTS (SELECT 1 FROM shop_payments p WHERE p.orderRowId = x.orderRowId AND p.gateway = 'duitku-sandbox')
       ORDER BY x.createdAt DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, unknown>>();
  return results.map((r) => {
    const o = mapShopOrder(r);
    const account = r.customerName == null ? null : { name: String(r.customerName), email: String(r.customerEmail) };
    // Guest orders: the email typed at checkout; "Guest" plus the account it joined (by email or voucher code), if any.
    return {
      ...o,
      customerEmail: o.guestKey ? (o.contactEmail ?? 'no email') : (account?.email ?? '-'),
      customerName: o.guestKey ? (account ? `Guest (account: ${account.name})` : 'Guest') : (account?.name ?? '-'),
      paidInvoice: (r.paidInvoice as string | null) ?? null,
      paidVia: (r.paidVia as string | null) ?? null,
    };
  });
}

function coordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new AppError(400, 'Titik lokasi tidak valid');
  return Math.round(n * 1e6) / 1e6;
}

export function parseAddress(input: unknown): DeliveryAddress {
  const a = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const latitude = coordinate(a.latitude, -90, 90);
  const longitude = coordinate(a.longitude, -180, 180);
  if ((latitude === null) !== (longitude === null)) throw new AppError(400, 'Titik lokasi tidak lengkap');
  return {
    recipientName: requireText(a.recipientName, 'Nama penerima', 100),
    recipientPhone: normalizePhone(a.recipientPhone),
    // Since 2026-10-24 checkout asks for one full address (street, RT/RW, kelurahan, kecamatan, kota) in `street`;
    // the separate parts stay optional ('' = not given) for older orders and callers that still send them.
    street: requireText(a.street, 'Alamat lengkap', 500),
    kelurahan: optionalText(a.kelurahan, 100) ?? '',
    kecamatan: optionalText(a.kecamatan, 100) ?? '',
    city: optionalText(a.city, 100) ?? '',
    notes: optionalText(a.notes, 300),
    latitude,
    longitude,
  };
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Street plus the kelurahan / kecamatan / kota given separately (older orders); empty parts are left out. */
export function fullAddress(a: Pick<DeliveryAddress, 'street' | 'kelurahan' | 'kecamatan' | 'city'>): string {
  return [a.street, a.kelurahan && `Kel. ${a.kelurahan}`, a.kecamatan && `Kec. ${a.kecamatan}`, a.city].filter(Boolean).join(', ');
}

/** The single-line address stored on the admin order (what the order list shows). */
export function addressLine(a: DeliveryAddress): string {
  let line = fullAddress(a);
  if (a.notes) line += ` (Catatan: ${a.notes})`;
  if (a.latitude !== null && a.longitude !== null) line += ` | Pin: ${mapsLink(a.latitude, a.longitude)}`;
  return line;
}

/** Price check for the checkout page (cart + optional voucher code), without saving anything. */
export async function quote(
  db: D1Database,
  buyer: Buyer,
  body: Record<string, unknown>,
  now: number,
): Promise<{ price: PriceBreakdown; voucher: CheckoutVoucher | null }> {
  const catalog = await loadCatalog(db);
  const { cart, bundles } = await readCart(db, body, catalog, now);
  if (body.voucherCode && priceCart(cart, null, catalog, undefined, bundles).voucherBase === 0) throw new AppError(400, noVoucherMessage(bundles));
  const voucher = body.voucherCode ? await findUsableVoucher(db, body.voucherCode, buyer, now) : null;
  const price = priceCart(cart, voucher, catalog, undefined, bundles);
  if (voucher) assertMinOrder(voucher, price.voucherBase);
  return { price, voucher };
}

/** The loose products (body.items) and the bundles (body.bundles) of a checkout. A cart with only bundles is fine. */
async function readCart(db: D1Database, body: Record<string, unknown>, catalog: Awaited<ReturnType<typeof loadCatalog>>, now: number) {
  const all = Array.isArray(body.bundles) && body.bundles.length ? await loadBundles(db) : [];
  const picked = parseCartBundles(body.bundles, all, catalog, now);
  const bundles: PricedBundleInput[] = picked.map((b) => ({ bundle: all.find((x) => x.id === b.bundleId)!, picks: b.picks }));
  const cart = parseCart(body.items, catalog, bundles.length > 0);
  return { cart, bundles };
}

/** A voucher was typed but everything in the cart is a bundle that takes no voucher. */
function noVoucherMessage(bundles: PricedBundleInput[]): string {
  const name = bundles[0]?.bundle.name ?? 'paket';
  return `Voucher tidak bisa dipakai untuk ${name}. Hapus kode vouchernya, atau tambah produk lain.`;
}

/** The delivery day the customer picked (YYYY-MM-DD), checked against the days offered at checkout. */
function parseDeliveryChoice(value: unknown, now: number, closedDays: string[], leadDays: number): string {
  const options = websiteDeliveryOptions(now, closedDays, WEBSITE_DELIVERY_CHOICES, leadDays);
  if (value === undefined || value === null || value === '') return options[0];
  const key = typeof value === 'string' ? value.trim() : '';
  if (options.includes(key)) return key;
  // E.g. the checkout page was opened before midnight and the earliest day has moved on.
  throw new AppError(400, 'Tanggal pengiriman tidak tersedia. Silakan pilih tanggal pengiriman lagi.');
}

/**
 * Places a website order. In one transaction it: records the submission key (retry-safe), saves the shop
 * details (items, prices, voucher, address) and creates the admin order row (for its order number and statuses).
 * Stock is NOT taken yet and the order stays out of the admin order list until it is paid (setPaymentPaid).
 * Stock never blocks a website order (it may go below zero, like admin-entered orders).
 * Website-only products are listed on the shop order only. Payment stays PENDING until paid.
 * Delivery date: chosen by the customer at checkout from websiteDeliveryOptions (default: the earliest day, i.e. the
 * same day before 14:00 WIB, else the next day; never a Sunday or an owner's day off, days-off.ts). A missing date means
 * the default; a date outside the options is refused. With `cityDelivery` (the "Kota" dropdown is on) the city must be
 * one of DELIVERY_CITIES, and the courier cities' soonest day is the day after the order (delivery-cities.ts).
 *
 * Guests (not signed in) get a private order link (guestKey). Their order joins an account's order list when the
 * voucher code belongs to a customer, else when the typed email has an account. A typed email with no account, and a
 * delivery phone with no account, makes a new account (no password yet) in the same transaction: newAccount.
 *
 * New-customer discount (body.newCustomerDiscount, guests): first purchase only. Refused when the delivery phone or
 * the typed email already holds it on an active order (new-customer.ts). An account with that email or phone whose
 * welcome voucher is unused spends that voucher; a new account gets its welcome voucher spent on this order;
 * otherwise it is the guest discount (no voucher row).
 */
export async function placeOrder(
  db: D1Database,
  buyer: Buyer,
  body: Record<string, unknown>,
  idempotencyKey: string | null,
  now: number,
  cityDelivery = false,
): Promise<{ order: ShopOrder; replayed: boolean; newAccount: Customer | null }> {
  const guest = isGuest(buyer) ? buyer : null;
  const opKey = idempotencyKey ? `shop:order:${guest ? 'guest' : (buyer as Customer).id}:${idempotencyKey}` : null;
  if (opKey) {
    const op = await findOperation(db, opKey);
    const existing = op?.refId ? await getShopOrder(db, op.refId) : null;
    if (existing) return { order: existing, replayed: true, newAccount: null };
  }

  const catalog = await loadCatalog(db);
  const { cart, bundles } = await readCart(db, body, catalog, now);
  const address = parseAddress(body.address);
  if (cityDelivery && !isDeliveryCity(address.city)) throw new AppError(400, 'Silakan pilih kota pengiriman.');
  // A guest's voucher limits are counted by the delivery phone number.
  const voucherBuyer: Buyer = guest ? { ...guest, phone: address.recipientPhone } : buyer;
  // Only bundles that take no voucher: a typed code is refused, and the new-customer discount is kept for next time.
  const voucherFree = priceCart(cart, null, catalog, undefined, bundles).voucherBase === 0;
  if (voucherFree && body.voucherCode) throw new AppError(400, noVoucherMessage(bundles));
  const wantsNewCustomer = Boolean(guest && body.newCustomerDiscount === true && !body.voucherCode && !voucherFree);
  let voucher = body.voucherCode ? await findUsableVoucher(db, body.voucherCode, voucherBuyer, now) : null;
  const newCustomer = wantsNewCustomer || voucher?.personal?.kind === 'WELCOME';
  const identity: Identity = {
    phones: [address.recipientPhone, ...(guest ? [] : [(buyer as Customer).phone])],
    emails: guest ? (guest.email ? [guest.email] : []) : [(buyer as Customer).email],
  };
  const welcomeRule = newCustomer ? (await loadVoucherRules(db)).WELCOME : null;
  if (newCustomer) await assertNewCustomerDiscountFree(db, identity, voucher?.percent ?? welcomeRule!.percent);
  if (wantsNewCustomer) voucher = await guestNewCustomerVoucher(db, voucherBuyer, guest!.email, address.recipientPhone, welcomeRule!, now);
  const price = priceCart(cart, voucher, catalog, cityDelivery ? address.city : undefined, bundles);
  if (voucher) assertMinOrder(voucher, price.voucherBase);
  const deliveryKey = parseDeliveryChoice(body.deliveryDate, now, await closedDeliveryDays(db, now), cityDelivery ? cityLeadDays(address.city) : 0);
  const q = price.stockQuantities;
  const products = await loadStockProducts(db);
  // Kept for orders read by older code: prices and names of the stock products.
  const stockLines = price.lines.filter((l) => l.stockColumn);
  const unitPrices = Object.fromEntries(stockLines.map((l) => [l.stockColumn, l.price]));
  const itemNames = Object.fromEntries(stockLines.map((l) => [l.stockColumn, l.name]));

  let customerId = guest ? await guestOrderAccount(db, voucher, guest.email) : (buyer as Customer).id;
  let newAccountId: string | null = null;
  if (guest?.email && guest.createAccount) {
    const taken = await db
      .prepare('SELECT 1 FROM shop_customers WHERE email = ? OR phone = ? LIMIT 1')
      .bind(guest.email, address.recipientPhone)
      .first();
    if (!taken) {
      newAccountId = newId();
      if (!customerId) customerId = newAccountId;
    }
  }

  // A new account's welcome voucher is spent right here when this order takes the new-customer discount.
  const newWelcome = newAccountId && wantsNewCustomer && !voucher?.personal ? { id: newId(), code: `JK-${randomCode(4)}-${randomCode(4)}` } : null;

  const id = newId();
  const statements: D1PreparedStatement[] = [];
  if (opKey) statements.push(operationKeyStatement(db, opKey, 'SHOP_ORDER', id, now));
  if (newAccountId) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shop_customers (id, email, name, phone, passwordHash, referredById, createdAt, updatedAt, emailVerifiedAt)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        // Counts as confirmed (no email code anywhere since 2026-10-22), so monthly vouchers reach it too.
        .bind(newAccountId, guest!.email, address.recipientName, address.recipientPhone, NO_PASSWORD, now, now, now),
    );
  }
  if (newWelcome) {
    statements.push(
      db
        .prepare(
          `INSERT INTO shop_vouchers (id, code, customerId, kind, percent, capAmount, period, sourceCustomerId, expiresAt, emailedAt, createdAt)
           VALUES (?, ?, ?, 'WELCOME', ?, ?, NULL, NULL, NULL, NULL, ?)`,
        )
        .bind(newWelcome.id, newWelcome.code, newAccountId, welcomeRule!.percent, welcomeRule!.cap, now),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO shop_orders
          (orderRowId, customerId, recipientName, recipientPhone, street, kelurahan, kecamatan, city, notes,
           latitude, longitude, unitPrices, itemNames, lineItems, subtotal, discount, deliveryFee, total, voucherId,
           campaignId, campaignCodeId, voucherActive, proofUploadedAt, createdAt, guestKey, contactEmail, newCustomerDiscount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        id, customerId, address.recipientName, address.recipientPhone, address.street, address.kelurahan,
        address.kecamatan, address.city, address.notes, address.latitude, address.longitude,
        JSON.stringify(unitPrices), JSON.stringify(itemNames), JSON.stringify(price.lines), price.subtotal, price.discount, price.deliveryFee, price.total,
        voucher?.personal?.id ?? newWelcome?.id ?? null, voucher?.campaign?.campaign.id ?? null, voucher?.campaign?.codeId ?? null, voucher ? 1 : 0, now,
        guest ? randomToken() : null, guest?.email ?? null, newCustomer ? 1 : 0,
      ),
  );
  // New-customer discount: another order of the same phone/email may not hold it at the same time (two tabs).
  if (newCustomer) statements.push(newCustomerGuardStatement(db, identity));
  // Admin vouchers: limits re-checked inside the transaction, right after the order row exists (see campaigns.ts).
  const guard = voucher?.campaign ? campaignGuardStatement(db, voucher.campaign, voucherBuyer, now) : null;
  if (guard) statements.push(guard);
  statements.push(
    ...orderInsertStatements(db, {
      id,
      now,
      customerName: address.recipientName,
      reseller: WEBSITE_RESELLER,
      parentReseller: null,
      address: addressLine(address),
      phone: displayPhone(address.recipientPhone),
      quantities: q,
      isPaydayPromo: false,
      boxCounter: calculateBoxCounter(q, 'None', products),
      deliveryDate: deliveryDateFromKey(deliveryKey),
    }, products, false),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (opKey && isUniqueViolation(error, 'operation_keys')) {
      const op = await findOperation(db, opKey);
      const existing = op?.refId ? await getShopOrder(db, op.refId) : null;
      if (existing) return { order: existing, replayed: true, newAccount: null };
    }
    // Someone signed up with the same email or phone a moment ago: the next try joins that account instead.
    if (newAccountId && isUniqueViolation(error, 'shop_customers')) throw new AppError(409, 'Pesanan gagal dibuat. Silakan coba lagi.');
    if (isUniqueViolation(error, 'voucherId')) throw new AppError(409, 'Voucher sudah pernah dipakai');
    if (newCustomer && isVoucherLimitError(error)) throw new AppError(409, newCustomerUsedMessage(voucher!.percent));
    if (isVoucherLimitError(error)) {
      // Someone took the last use a moment ago: show the exact reason when we can.
      await findUsableVoucher(db, body.voucherCode, voucherBuyer, Date.now());
      throw new AppError(409, 'Kuota voucher ini sudah habis');
    }
    throw error;
  }

  const order = await getShopOrder(db, id);
  if (!order) throw new Error('Order was created but could not be read back');
  const newAccount = newAccountId ? await getCustomer(db, newAccountId) : null;
  return { order, replayed: false, newAccount };
}

/**
 * The new-customer discount for a guest: the unused welcome voucher of the account with that email (first) or phone,
 * else the guest discount with the welcome terms. (Already used was checked before.)
 */
async function guestNewCustomerVoucher(
  db: D1Database,
  buyer: Buyer,
  email: string | null,
  phone: string,
  rule: { percent: number; cap: number },
  now: number,
): Promise<CheckoutVoucher> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.disabledAt, (SELECT v.code FROM shop_vouchers v WHERE v.customerId = c.id AND v.kind = 'WELCOME') AS welcomeCode
       FROM shop_customers c WHERE c.email = ? OR c.phone = ? ORDER BY (c.email = ?) DESC`,
    )
    .bind(email ?? '', phone, email ?? '')
    .all<{ id: string; disabledAt: number | null; welcomeCode: string | null }>();
  for (const account of results) {
    if (account.disabledAt != null) throw new AppError(409, newCustomerUsedMessage(rule.percent));
    if (account.welcomeCode) return findUsableVoucher(db, account.welcomeCode, buyer, now);
  }
  return { code: NEW_CUSTOMER_CODE, percent: rule.percent, fixedAmount: null, capAmount: rule.cap, minOrder: 0, personal: null, campaign: null };
}

/**
 * The account a guest's order joins: the owner of the personal voucher used, else the account the email-blast code
 * was sent to, else the account with the typed email. '' = none.
 */
async function guestOrderAccount(db: D1Database, voucher: CheckoutVoucher | null, email: string | null): Promise<string> {
  if (voucher?.personal) return voucher.personal.customerId;
  const blastEmail = voucher?.campaign?.codeEmail;
  if (blastEmail) {
    const owner = await findCustomerByEmail(db, blastEmail);
    if (owner) return owner.id;
  }
  return email ? ((await findCustomerByEmail(db, email))?.id ?? '') : '';
}

export type PaymentMethod = 'QRIS' | WalletMethod | 'TRANSFER';
/** E-wallets whose app the payment page opens directly: OVO and ShopeePay on Duitku, DANA on DOKU. */
export type WalletMethod = WalletChannel;
export const WALLET_METHODS: readonly WalletMethod[] = ['OVO', 'SHOPEEPAY', 'DANA'];
export const WALLET_LABEL: Record<WalletMethod, string> = { OVO: 'OVO', SHOPEEPAY: 'ShopeePay', DANA: 'DANA' };

export function isWalletMethod(value: unknown): value is WalletMethod {
  return WALLET_METHODS.includes(value as WalletMethod);
}

export function parsePaymentMethod(value: unknown): PaymentMethod {
  if (value === 'QRIS' || value === 'TRANSFER' || isWalletMethod(value)) return value;
  throw new AppError(400, 'Pilih cara pembayaran');
}

/** The customer picks (or switches) how they pay an unpaid order. */
export async function setPaymentMethod(
  db: D1Database,
  viewer: OrderViewer | string, // a customer id = that signed-in customer
  orderRowId: string,
  method: PaymentMethod,
): Promise<ShopOrder> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || !canViewOrder(order, asViewer(viewer))) throw new AppError(404, 'Pesanan tidak ditemukan');
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'Pesanan ini sudah dibatalkan');
  if (order.paymentStatus === 'PAID') throw new AppError(409, 'Pesanan ini sudah dibayar');
  await db.prepare('UPDATE shop_orders SET paymentMethod = ? WHERE orderRowId = ?').bind(method, orderRowId).run();
  return (await getShopOrder(db, orderRowId))!;
}

// ---------------------------------------------------------------------------
// Payment proof (screenshot of the bank transfer)
// ---------------------------------------------------------------------------

const MAX_PROOF_BASE64 = 1_500_000; // ~1.1 MB image; the browser resizes before upload
/** PDFs are stored as they are; a D1 row holds at most 2 MB, so the file itself may be up to ~1.3 MB. */
export const MAX_PROOF_PDF_BYTES = 1_300_000;
const MAX_PROOF_PDF_BASE64 = Math.ceil(MAX_PROOF_PDF_BYTES / 3) * 4;

export async function saveProof(
  db: D1Database,
  viewer: OrderViewer | string, // a customer id = that signed-in customer
  orderRowId: string,
  dataUrl: unknown,
  now: number,
): Promise<{ order: ShopOrder; first: boolean }> {
  const order = await getShopOrder(db, orderRowId);
  if (!order || !canViewOrder(order, asViewer(viewer))) throw new AppError(404, 'Pesanan tidak ditemukan');
  if (order.orderStatus !== 'ACTIVE') throw new AppError(409, 'Pesanan ini sudah dibatalkan');
  if (order.paymentStatus === 'PAID') throw new AppError(409, 'Pembayaran pesanan ini sudah dikonfirmasi');

  const m = /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(typeof dataUrl === 'string' ? dataUrl : '');
  if (!m) throw new AppError(400, 'File harus berupa gambar (JPG/PNG) atau PDF');
  const pdf = m[1] === 'application/pdf';
  if (m[2].length > (pdf ? MAX_PROOF_PDF_BASE64 : MAX_PROOF_BASE64)) {
    throw new AppError(413, pdf ? 'File PDF terlalu besar (maks. 1,3 MB). Kirim screenshot bukti transfer saja.' : 'Gambar terlalu besar');
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO shop_payment_proofs (orderRowId, mimeType, data, uploadedAt) VALUES (?, ?, ?, ?)
         ON CONFLICT(orderRowId) DO UPDATE SET mimeType = excluded.mimeType, data = excluded.data, uploadedAt = excluded.uploadedAt`,
      )
      .bind(orderRowId, m[1], m[2], now),
    db.prepare('UPDATE shop_orders SET proofUploadedAt = ? WHERE orderRowId = ?').bind(now, orderRowId),
  ]);
  const updated = await getShopOrder(db, orderRowId);
  return { order: updated!, first: order.proofUploadedAt === null };
}

export async function getProof(db: D1Database, orderRowId: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const row = await db
    .prepare('SELECT mimeType, data FROM shop_payment_proofs WHERE orderRowId = ?')
    .bind(orderRowId)
    .first<{ mimeType: string; data: string }>();
  if (!row) return null;
  const bin = atob(row.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mimeType: row.mimeType, bytes };
}
