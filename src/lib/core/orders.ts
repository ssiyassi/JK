import {
  AppError,
  INVENTORY_ROW_ID,
  isUniqueViolation,
  newId,
  toDate,
  toDateOrNull,
  type D1Database,
  type D1PreparedStatement,
  type Quantities,
} from './d1.ts';
import { findOperation, getInventory, historyColumns, operationKeyStatement } from './inventory.ts';
import { col, fillQuantities, loadStockProducts, roundBoxes, type StockProduct } from './products.ts';
import { orderIdPrefix } from './time.ts';

export interface Order {
  id: string;
  orderId: string;
  date: Date;
  customerName: string;
  reseller: string;
  parentReseller: string | null;
  address: string;
  phoneNumber: string;
  quantities: Quantities; // boxes per stock product
  isPaydayPromo: boolean;
  boxCounter: number;
  orderStatus: 'ACTIVE' | 'CANCELLED';
  /** FREE = reward boxes given away: stock is taken, but they count 0 boxes for sales and rewards. */
  paymentStatus: 'PENDING' | 'PAID' | 'FREE';
  deliveryStatus: 'PENDING' | 'DELIVERED';
  deliveryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  fromWebsite: boolean; // placed on jentiskitchen.id (managed on the Website Orders page)
  websiteShipped: boolean; // website order the owner already shipped: on its way, can no longer be cancelled
  websiteCity: string | null; // city of a website order (the "Kota" dropdown); null for admin-entered orders
  courierFee: number | null; // what the owner paid the courier (Rupiah), null = not entered yet
}

/**
 * A website order joins the admin order list (and takes its stock) only once it is paid; until then
 * shop_orders.stockTakenAt is NULL. Use with the orders table aliased as "o".
 */
export const COUNTED_ORDER = `NOT EXISTS (SELECT 1 FROM shop_orders s WHERE s.orderRowId = o.id AND s.stockTakenAt IS NULL)`;

const ORDER_SELECT = `SELECT o.*, s.orderRowId AS shopRowId, s.shippedAt AS shopShippedAt, s.city AS shopCity
  FROM orders o LEFT JOIN shop_orders s ON s.orderRowId = o.id`;

export function mapOrder(r: Record<string, unknown>, products: StockProduct[]): Order {
  return {
    id: String(r.id),
    orderId: String(r.orderId),
    date: toDate(r.date),
    customerName: String(r.customerName),
    reseller: String(r.reseller),
    parentReseller: (r.parentReseller as string | null) ?? null,
    address: String(r.address),
    phoneNumber: String(r.phoneNumber),
    quantities: Object.fromEntries(products.map((p) => [p.key, Number(r[p.key] ?? 0)])),
    isPaydayPromo: r.isPaydayPromo === 1 || r.isPaydayPromo === true || r.isPaydayPromo === '1',
    boxCounter: Number(r.boxCounter),
    orderStatus: r.orderStatus as Order['orderStatus'],
    paymentStatus: r.paymentStatus as Order['paymentStatus'],
    deliveryStatus: r.deliveryStatus as Order['deliveryStatus'],
    deliveryDate: toDateOrNull(r.deliveryDate),
    createdAt: toDate(r.createdAt),
    updatedAt: toDate(r.updatedAt),
    fromWebsite: r.shopRowId !== null && r.shopRowId !== undefined,
    websiteShipped: r.shopShippedAt !== null && r.shopShippedAt !== undefined,
    websiteCity: typeof r.shopCity === 'string' && r.shopCity ? r.shopCity : null,
    courierFee: r.courierFee === null || r.courierFee === undefined ? null : Number(r.courierFee),
  };
}

/**
 * Box counter: each pack counts as its product's box value (1 unless set otherwise, may be a decimal).
 * Unchanged business rule: Payday Promo counts floor(sum / 3 * 2) boxes. Without `products` every pack counts 1.
 */
export function calculateBoxCounter(q: Quantities, promo: string, products?: StockProduct[], free = false): number {
  if (free) return 0; // free reward boxes are not sales
  const value = (key: string) => products?.find((p) => p.key === key)?.boxValue ?? 1;
  const sum = roundBoxes(Object.entries(q).reduce((total, [key, qty]) => total + qty * value(key), 0));
  return promo === 'Payday Promo' ? Math.floor((sum / 3) * 2) : sum;
}

/** The admin order list: every order except website orders that are not paid yet. */
export async function listOrders(db: D1Database, products?: StockProduct[]): Promise<Order[]> {
  const list = products ?? (await loadStockProducts(db));
  const { results } = await db.prepare(`${ORDER_SELECT} WHERE ${COUNTED_ORDER} ORDER BY o.date DESC`).all<Record<string, unknown>>();
  return results.map((r) => mapOrder(r, list));
}

export async function getOrder(db: D1Database, id: string, products?: StockProduct[]): Promise<Order | null> {
  const list = products ?? (await loadStockProducts(db));
  const row = await db.prepare(`${ORDER_SELECT} WHERE o.id = ?`).bind(id).first<Record<string, unknown>>();
  return row ? mapOrder(row, list) : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}

/** Quantities from a request: { quantities: {key: n} } or the product keys directly on the body. */
function quantitiesFrom(body: Record<string, unknown>, products: StockProduct[]): Quantities {
  const source = (body.quantities && typeof body.quantities === 'object' ? body.quantities : body) as Record<string, unknown>;
  const q: Quantities = {};
  for (const p of products) {
    const v = Number(source[p.key] ?? 0);
    if (!Number.isInteger(v)) throw new AppError(400, `${p.label} must be a whole number`);
    if (v < 0) throw new AppError(400, 'Product quantities cannot be negative');
    q[p.key] = v;
  }
  return q;
}

function parseDeliveryDate(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(str(v)); // 'YYYY-MM-DD' -> UTC midnight, exactly as before
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'Invalid delivery date');
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface NewOrderRow {
  id: string;
  now: number;
  customerName: string;
  reseller: string;
  parentReseller: string | null;
  address: string;
  phone: string;
  quantities: Quantities;
  isPaydayPromo: boolean;
  boxCounter: number;
  deliveryDate: number | null;
  /** Admin "Mark as free product": payment status FREE instead of PENDING. */
  free?: boolean;
}

/**
 * The statements that create an order: the order row, then (admin orders) its stock movement and the inventory
 * deduction. Shared by the admin order form and the online shop so both follow exactly the same rules.
 * Website orders pass takeStock = false: their stock is taken when they are paid (see setPaymentPaid).
 * Run them inside one db.batch() together with any other statements of the same operation.
 */
export function orderInsertStatements(db: D1Database, o: NewOrderRow, products: StockProduct[], takeStock = true): D1PreparedStatement[] {
  const keys = products.map((p) => p.key);
  const q = fillQuantities(products, o.quantities);
  const prefix = orderIdPrefix(o.now);
  const insert =
    // Order ID = DDMMYYYY (Jakarta) + next 4-digit sequence for that day, computed inside the
    // transaction so two simultaneous orders cannot receive the same ID.
    db
      .prepare(
        `INSERT INTO orders
          (id, orderId, date, customerName, reseller, parentReseller, address, phoneNumber,
           ${keys.map((k) => `${col(k)}, `).join('')}isPaydayPromo, boxCounter,
           orderStatus, paymentStatus, deliveryStatus, deliveryDate, createdAt, updatedAt)
         SELECT ?, ? || printf('%04d', COALESCE(MAX(CAST(substr(orderId, 9) AS INTEGER)), 0) + 1), ?, ?, ?, ?, ?, ?,
           ${keys.map(() => '?, ').join('')}?, ?, 'ACTIVE', ?, 'PENDING', ?, ?, ?
         FROM orders WHERE length(orderId) = 12 AND substr(orderId, 1, 8) = ?`,
      )
      .bind(
        o.id, prefix, o.now, o.customerName, o.reseller, o.parentReseller, o.address, o.phone,
        ...keys.map((k) => q[k]), o.isPaydayPromo ? 1 : 0, o.boxCounter, o.free ? 'FREE' : 'PENDING',
        o.deliveryDate, o.now, o.now, prefix,
      );
  if (!takeStock) return [insert];
  return [
    insert,
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'ORDER', (SELECT orderId FROM orders WHERE id = ?),
           ${keys.map((k) => col(k)).join(', ')},
           ${keys.map(() => '?').join(', ')},
           ${keys.map((k) => `${col(k)} - ?`).join(', ')}, ?
         FROM current_inventory WHERE id = ?`,
      )
      .bind(newId(), o.now, o.id, ...keys.map((k) => -q[k]), ...keys.map((k) => q[k]), o.now, INVENTORY_ROW_ID),
    db
      .prepare(`UPDATE current_inventory SET ${keys.map((k) => `${col(k)} = ${col(k)} - ?`).join(', ')}, updatedAt = ? WHERE id = ?`)
      .bind(...keys.map((k) => q[k]), o.now, INVENTORY_ROW_ID),
  ];
}

export async function createOrder(
  db: D1Database,
  body: Record<string, unknown>,
  idempotencyKey: string | null,
): Promise<{ order: Order; replayed: boolean }> {
  const reseller = str(body.reseller);
  const parentReseller = str(body.parentReseller);
  const recipientName = str(body.recipientName);
  const phone = str(body.phone);
  const address = str(body.address);
  const free = body.isFree === true;
  const promo = free ? 'None' : str(body.promo);

  if (!reseller || !recipientName || !phone || !address || !body.deliveryDate || !promo) {
    throw new AppError(400, 'All mandatory fields must be filled');
  }

  const existingReseller = await db
    .prepare('SELECT id FROM resellers WHERE reseller = ? AND parentReseller IS ? LIMIT 1')
    .bind(reseller.trim(), parentReseller.trim() || null)
    .first();
  if (!existingReseller) {
    throw new AppError(400, 'Reseller not found. Please register the reseller first before creating an order.');
  }

  const products = await loadStockProducts(db);
  const q = quantitiesFrom(body, products);
  if (Object.values(q).every((v) => v === 0)) {
    throw new AppError(400, 'At least one product must have quantity greater than 0');
  }
  const deliveryDate = parseDeliveryDate(body.deliveryDate);
  const boxCounter = calculateBoxCounter(q, promo, products, free);

  const opKey = idempotencyKey ? `order:create:${idempotencyKey}` : null;
  if (opKey) {
    const replay = await replayCreate(db, opKey);
    if (replay) return { order: replay, replayed: true };
  }

  await getInventory(db, products);
  const id = newId();
  const now = Date.now();

  const statements: D1PreparedStatement[] = [];
  if (opKey) statements.push(operationKeyStatement(db, opKey, 'CREATE_ORDER', id, now));
  statements.push(
    ...orderInsertStatements(db, {
      id, now, customerName: recipientName, reseller, parentReseller: parentReseller || null, address, phone,
      quantities: q, isPaydayPromo: promo === 'Payday Promo', boxCounter, deliveryDate, free,
    }, products),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (opKey && isUniqueViolation(error, 'operation_keys')) {
      const replay = await replayCreate(db, opKey);
      if (replay) return { order: replay, replayed: true };
    }
    throw error;
  }

  const order = await getOrder(db, id, products);
  if (!order) throw new Error('Order was created but could not be read back');
  return { order, replayed: false };
}

async function replayCreate(db: D1Database, opKey: string): Promise<Order | null> {
  const op = await findOperation(db, opKey);
  return op?.refId ? getOrder(db, op.refId) : null;
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

export async function editOrder(
  db: D1Database,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey: string | null,
): Promise<{ order: Order; inventoryChanges: Quantities | null; replayed: boolean }> {
  const customerName = str(body.customerName).trim();
  const reseller = str(body.reseller).trim();
  const parentReseller = str(body.parentReseller).trim();
  const address = str(body.address).trim();
  const phoneNumber = str(body.phoneNumber).trim();

  if (!customerName) throw new AppError(400, 'Customer name is required');
  if (!address) throw new AppError(400, 'Address is required');
  if (!reseller) throw new AppError(400, 'Reseller is required');
  const products = await loadStockProducts(db);
  const keys = products.map((p) => p.key);
  const q = quantitiesFrom(body, products);
  const deliveryDate = parseDeliveryDate(body.deliveryDate);

  const opKey = idempotencyKey ? `order:edit:${idempotencyKey}` : null;
  if (opKey && (await findOperation(db, opKey))) {
    const order = await getOrder(db, id);
    if (!order) throw new AppError(404, 'Order not found');
    return { order, inventoryChanges: null, replayed: true };
  }

  await getInventory(db, products);
  // The difference is computed from the quantities stored in the database, never from values sent by the browser.
  const stored = await getOrder(db, id, products);
  if (!stored) throw new AppError(404, 'Order not found');
  if (stored.deliveryStatus === 'DELIVERED') {
    throw new AppError(409, 'This order is already delivered and can no longer be edited. Duplicate it instead.');
  }

  // isFree left out (older page): the order keeps what it was. Unticking free makes the payment pending again.
  const free = typeof body.isFree === 'boolean' ? body.isFree : stored.paymentStatus === 'FREE';
  const paymentStatus = free ? 'FREE' : stored.paymentStatus === 'FREE' ? 'PENDING' : stored.paymentStatus;
  const isPaydayPromo = !free && Boolean(body.isPaydayPromo);
  const boxCounter = calculateBoxCounter(q, isPaydayPromo ? 'Payday Promo' : 'None', products, free);

  const change: Quantities = Object.fromEntries(keys.map((k) => [k, stored.quantities[k] - q[k]]));
  const hasQuantityChanges = Object.values(change).some((v) => v !== 0);
  if (hasQuantityChanges && stored.orderStatus !== 'ACTIVE') {
    throw new AppError(409, 'Quantities of a cancelled order cannot be changed');
  }

  const now = Math.max(Date.now(), stored.updatedAt.getTime() + 1);
  const statements: D1PreparedStatement[] = [];
  if (opKey) statements.push(operationKeyStatement(db, opKey, 'EDIT_ORDER', id, now));

  // Inventory and history statements read the order's quantities inside the transaction,
  // so a concurrent edit or cancel can never be double-counted. They are no-ops if nothing changed
  // or the order is not ACTIVE.
  const qs = keys.map((k) => q[k]);
  const differs = `(${keys.map((k) => `o.${col(k)} != ?`).join(' OR ')})`;
  statements.push(
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'EDIT_ORDER', o.orderId,
           ${keys.map((k) => `i.${col(k)}`).join(', ')},
           ${keys.map((k) => `o.${col(k)} - ?`).join(', ')},
           ${keys.map((k) => `i.${col(k)} + (o.${col(k)} - ?)`).join(', ')}, ?
         FROM current_inventory i, orders o
         WHERE i.id = ? AND o.id = ? AND o.orderStatus = 'ACTIVE' AND ${differs} AND ${COUNTED_ORDER}`,
      )
      .bind(newId(), now, ...qs, ...qs, now, INVENTORY_ROW_ID, id, ...qs),
    db
      .prepare(
        `UPDATE current_inventory SET
           ${keys.map((k) => `${col(k)} = ${col(k)} + ((SELECT ${col(k)} FROM orders WHERE id = ?) - ?)`).join(',\n           ')},
           updatedAt = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.orderStatus = 'ACTIVE' AND ${differs} AND ${COUNTED_ORDER})`,
      )
      .bind(...keys.flatMap((k) => [id, q[k]]), now, INVENTORY_ROW_ID, id, ...qs),
    db
      .prepare(
        `UPDATE orders SET
           customerName = ?, reseller = ?, parentReseller = ?, address = ?, phoneNumber = ?,
           isPaydayPromo = ?, deliveryDate = ?, paymentStatus = ?,
           ${keys.map((k) => `${col(k)} = ?, `).join('')}boxCounter = ?, updatedAt = ?
         WHERE id = ?`,
      )
      .bind(
        customerName, reseller, parentReseller || null, address, phoneNumber,
        isPaydayPromo ? 1 : 0, deliveryDate, paymentStatus,
        ...qs, boxCounter, now, id,
      ),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (opKey && isUniqueViolation(error, 'operation_keys')) {
      const order = await getOrder(db, id);
      if (order) return { order, inventoryChanges: null, replayed: true };
    }
    throw error;
  }

  const order = await getOrder(db, id, products);
  if (!order) throw new AppError(404, 'Order not found');
  return { order, inventoryChanges: hasQuantityChanges ? change : null, replayed: false };
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelOrder(
  db: D1Database,
  id: string,
): Promise<{ order: Order; alreadyCancelled: boolean }> {
  const products = await loadStockProducts(db);
  const keys = products.map((p) => p.key);
  const order = await getOrder(db, id, products);
  if (!order) throw new AppError(404, 'Order not found');
  if (order.orderStatus === 'CANCELLED') return { order, alreadyCancelled: true };
  if (order.deliveryStatus === 'DELIVERED') {
    throw new AppError(409, 'This order is already delivered and can no longer be cancelled');
  }
  if (order.websiteShipped) throw new AppError(409, 'This website order is already shipped and can no longer be cancelled');
  await getInventory(db, products);

  const now = Math.max(Date.now(), order.updatedAt.getTime() + 1);
  // One cancel per order, ever: the operation key is derived from the order id, so a retried or
  // double-clicked cancel fails as a whole and stock is returned exactly once.
  const statements = [
    operationKeyStatement(db, `order:cancel:${id}`, 'CANCEL_ORDER', id, now),
    db
      .prepare(`UPDATE orders SET orderStatus = 'CANCELLED', updatedAt = ? WHERE id = ? AND orderStatus = 'ACTIVE'`)
      .bind(now, id),
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'CANCEL_ORDER', o.orderId,
           ${keys.map((k) => `i.${col(k)}`).join(', ')},
           ${keys.map((k) => `o.${col(k)}`).join(', ')},
           ${keys.map((k) => `i.${col(k)} + o.${col(k)}`).join(', ')}, ?
         FROM current_inventory i, orders o
         WHERE i.id = ? AND o.id = ? AND o.orderStatus = 'CANCELLED' AND o.updatedAt = ? AND ${COUNTED_ORDER}`,
      )
      .bind(newId(), now, now, INVENTORY_ROW_ID, id, now),
    db
      .prepare(
        `UPDATE current_inventory SET
           ${keys.map((k) => `${col(k)} = ${col(k)} + (SELECT ${col(k)} FROM orders WHERE id = ?)`).join(',\n           ')},
           updatedAt = ?
         WHERE id = ? AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.orderStatus = 'CANCELLED' AND o.updatedAt = ? AND ${COUNTED_ORDER})`,
      )
      .bind(...keys.map(() => id), now, INVENTORY_ROW_ID, id, now),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    if (isUniqueViolation(error, 'operation_keys')) {
      const current = await getOrder(db, id, products);
      if (current) return { order: current, alreadyCancelled: true };
    }
    throw error;
  }
  const updated = await getOrder(db, id, products);
  if (!updated) throw new AppError(404, 'Order not found');
  return { order: updated, alreadyCancelled: false };
}

// ---------------------------------------------------------------------------
// Paid / delivered (single-statement updates; naturally safe to repeat)
// ---------------------------------------------------------------------------

/**
 * Marks an order paid. A website order that is still active also takes its stock now (once, logged as an ORDER
 * stock movement) and from then on appears in the admin order list. Safe to repeat.
 */
/**
 * With `takeStock: false` (Duitku sandbox test payments) only the payment status changes: the website order keeps
 * stockTakenAt NULL, so it never takes stock nor joins the admin order list, reports or the Telegram delivery list.
 */
export async function setPaymentPaid(db: D1Database, id: string, opts: { takeStock?: boolean } = {}): Promise<Order> {
  const now = Date.now();
  const products = await loadStockProducts(db);
  const keys = products.map((p) => p.key);
  if (opts.takeStock === false) {
    const paid = await db
      .prepare(`UPDATE orders SET paymentStatus = CASE WHEN paymentStatus = 'FREE' THEN 'FREE' ELSE 'PAID' END, updatedAt = ? WHERE id = ?`)
      .bind(now, id)
      .run();
    if (!paid.meta.changes) throw new AppError(404, 'Order not found');
    const order = await getOrder(db, id, products);
    if (!order) throw new AppError(404, 'Order not found');
    return order;
  }
  // Website order, active, stock not taken yet. Every statement re-checks this inside the transaction.
  const pending = `EXISTS (SELECT 1 FROM shop_orders s JOIN orders o ON o.id = s.orderRowId
    WHERE s.orderRowId = ? AND s.stockTakenAt IS NULL AND o.orderStatus = 'ACTIVE')`;
  const [paid] = await db.batch([
    db
      .prepare(`UPDATE orders SET paymentStatus = CASE WHEN paymentStatus = 'FREE' THEN 'FREE' ELSE 'PAID' END, updatedAt = ? WHERE id = ?`)
      .bind(now, id),
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'ORDER', o.orderId,
           ${keys.map((k) => `i.${col(k)}`).join(', ')},
           ${keys.map((k) => `-o.${col(k)}`).join(', ')},
           ${keys.map((k) => `i.${col(k)} - o.${col(k)}`).join(', ')}, ?
         FROM current_inventory i, orders o
         WHERE i.id = ? AND o.id = ? AND ${pending}`,
      )
      .bind(newId(), now, now, INVENTORY_ROW_ID, id, id),
    db
      .prepare(
        `UPDATE current_inventory SET
           ${keys.map((k) => `${col(k)} = ${col(k)} - (SELECT ${col(k)} FROM orders WHERE id = ?)`).join(',\n           ')},
           updatedAt = ?
         WHERE id = ? AND ${pending}`,
      )
      .bind(...keys.map(() => id), now, INVENTORY_ROW_ID, id),
    db
      .prepare(
        `UPDATE shop_orders SET stockTakenAt = ? WHERE orderRowId = ? AND stockTakenAt IS NULL
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = shop_orders.orderRowId AND o.orderStatus = 'ACTIVE')`,
      )
      .bind(now, id),
  ]);
  if (!paid.meta.changes) throw new AppError(404, 'Order not found');
  const order = await getOrder(db, id, products);
  if (!order) throw new AppError(404, 'Order not found');
  return order;
}

/** Highest delivery fee accepted, to catch typos with extra zeros. */
const MAX_COURIER_FEE = 1_000_000;

/** The delivery fee the owner paid the courier: whole Rupiah, 0 allowed (delivered by hand). */
export function parseCourierFee(v: unknown): number {
  if (v === undefined || v === null || String(v).trim() === '') throw new AppError(400, 'Enter the delivery fee you paid for this order');
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[.\s]/g, ''));
  if (!Number.isInteger(n) || n < 0) throw new AppError(400, 'Delivery fee must be a whole rupiah amount (0 or more)');
  if (n > MAX_COURIER_FEE) throw new AppError(400, `Delivery fee looks too high (more than Rp ${MAX_COURIER_FEE.toLocaleString('id-ID')}): check for extra zeros`);
  return n;
}

/**
 * Marks an order delivered. The delivery fee is required unless the order already has one
 * (website orders get it when they are shipped); a fee sent along replaces the stored one.
 */
export async function setDelivered(db: D1Database, id: string, courierFeeInput?: unknown): Promise<Order> {
  const given = courierFeeInput !== undefined && courierFeeInput !== null && String(courierFeeInput).trim() !== '';
  if (!given) {
    const row = await db.prepare('SELECT courierFee FROM orders WHERE id = ?').bind(id).first<{ courierFee: number | null }>();
    if (!row) throw new AppError(404, 'Order not found');
    if (row.courierFee === null) throw new AppError(400, 'Enter the delivery fee you paid for this order');
    return setStatus(db, id, `deliveryStatus = 'DELIVERED', ${deliveredNow()}`);
  }
  return setStatus(db, id, `deliveryStatus = 'DELIVERED', ${deliveredNow()}, courierFee = ${parseCourierFee(courierFeeInput)}`);
}

/** When the order was marked delivered (reseller weeks, periods and stamps count from it); kept if already set. */
function deliveredNow(): string {
  return `deliveredAt = COALESCE(deliveredAt, ${Math.floor(Date.now())})`;
}

/** Saves or corrects the delivery fee of an order. */
export async function setCourierFee(db: D1Database, id: string, courierFeeInput: unknown): Promise<Order> {
  return setStatus(db, id, `courierFee = ${parseCourierFee(courierFeeInput)}`);
}

async function setStatus(db: D1Database, id: string, assignment: string): Promise<Order> {
  const result = await db.prepare(`UPDATE orders SET ${assignment}, updatedAt = ? WHERE id = ?`).bind(Date.now(), id).run();
  if (!result.meta.changes) throw new AppError(404, 'Order not found');
  const order = await getOrder(db, id);
  if (!order) throw new AppError(404, 'Order not found');
  return order;
}
