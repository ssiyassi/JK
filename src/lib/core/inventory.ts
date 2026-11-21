import {
  AppError,
  INVENTORY_ROW_ID,
  isUniqueViolation,
  newId,
  toDate,
  type D1Database,
  type D1PreparedStatement,
  type Quantities,
} from './d1.ts';
import { col, fillQuantities, loadStockProducts, type StockProduct } from './products.ts';

export interface Inventory {
  id: string;
  quantities: Quantities; // stock per product key
  updatedAt: Date;
}

export interface StockMovement extends Record<string, unknown> {
  id: string;
  date: Date;
  type: 'STOCK_ADJUSTMENT' | 'PRODUCTION' | 'ORDER' | 'CANCEL_ORDER' | 'EDIT_ORDER';
  orderId: string | null;
  createdAt: Date;
}

export async function getInventory(db: D1Database, products?: StockProduct[]): Promise<Inventory> {
  const list = products ?? (await loadStockProducts(db));
  const row = await db
    .prepare('SELECT * FROM current_inventory WHERE id = ?')
    .bind(INVENTORY_ROW_ID)
    .first<Record<string, unknown>>();
  if (!row) throw new AppError(500, 'Current inventory not found');
  return {
    id: String(row.id),
    quantities: Object.fromEntries(list.map((p) => [p.key, Number(row[p.key] ?? 0)])),
    updatedAt: toDate(row.updatedAt),
  };
}

export async function listStockMovements(db: D1Database): Promise<StockMovement[]> {
  const { results } = await db
    .prepare('SELECT * FROM stock_movement_history ORDER BY date DESC')
    .all<Record<string, unknown>>();
  return results.map((r) => ({
    ...r,
    id: String(r.id),
    date: toDate(r.date),
    createdAt: toDate(r.createdAt),
    orderId: (r.orderId as string | null) ?? null,
    type: r.type as StockMovement['type'],
  }));
}

/**
 * Records an "operation key" so the same request can never be applied twice.
 * Placed first in a batch: a duplicate key makes the whole batch fail and roll back.
 */
export function operationKeyStatement(
  db: D1Database,
  key: string,
  kind: string,
  refId: string | null,
  now: number,
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO operation_keys (key, kind, refId, createdAt) VALUES (?, ?, ?, ?)')
    .bind(key, kind, refId, now);
}

export async function findOperation(db: D1Database, key: string): Promise<{ refId: string | null } | null> {
  return db.prepare('SELECT refId FROM operation_keys WHERE key = ?').bind(key).first<{ refId: string | null }>();
}

type ProductionResult = { newInventory: Quantities; replayed: boolean };

/** Column list of a stock_movement_history insert: id, date, type, orderId, then beginning/changes/final per product. */
export function historyColumns(products: StockProduct[]): string {
  return [
    'id', 'date', 'type', '"orderId"',
    ...products.map((p) => col(p.key, 'Beginning')),
    ...products.map((p) => col(p.key, 'Changes')),
    ...products.map((p) => col(p.key, 'Final')),
    '"createdAt"',
  ].join(', ');
}

/**
 * Add production: inventory += quantities, logged as PRODUCTION. Atomic and retry-safe.
 * `extra` adds statements to the same batch (the meat prices), given the new history row id.
 */
export async function addProduction(
  db: D1Database,
  quantities: Quantities,
  idempotencyKey: string | null,
  extra?: (productionId: string, now: number) => D1PreparedStatement[],
): Promise<ProductionResult> {
  const products = await loadStockProducts(db);
  await getInventory(db, products); // fail clearly if the inventory row is missing
  const now = Date.now();
  const q = fillQuantities(products, quantities);
  const opKey = idempotencyKey ? `production:${idempotencyKey}` : null;

  if (opKey && (await findOperation(db, opKey))) {
    return { newInventory: await currentQuantities(db, products), replayed: true };
  }

  const keys = products.map((p) => p.key);
  const productionId = newId();
  const statements: D1PreparedStatement[] = [];
  if (opKey) statements.push(operationKeyStatement(db, opKey, 'PRODUCTION', null, now));
  statements.push(
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'PRODUCTION', NULL,
           ${keys.map((k) => col(k)).join(', ')},
           ${keys.map(() => '?').join(', ')},
           ${keys.map((k) => `${col(k)} + ?`).join(', ')}, ?
         FROM current_inventory WHERE id = ?`,
      )
      .bind(productionId, now, ...keys.map((k) => q[k]), ...keys.map((k) => q[k]), now, INVENTORY_ROW_ID),
    db
      .prepare(
        `UPDATE current_inventory SET ${keys.map((k) => `${col(k)} = ${col(k)} + ?`).join(', ')}, updatedAt = ? WHERE id = ?`,
      )
      .bind(...keys.map((k) => q[k]), now, INVENTORY_ROW_ID),
    ...(extra ? extra(productionId, now) : []),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (opKey && isUniqueViolation(error, 'operation_keys')) {
      return { newInventory: await currentQuantities(db, products), replayed: true };
    }
    throw error;
  }
  return { newInventory: await currentQuantities(db, products), replayed: false };
}

/**
 * Stock adjustment: sets absolute stock levels (blank fields keep the current value),
 * logged as STOCK_ADJUSTMENT with the computed change. Atomic and retry-safe.
 */
export async function adjustStock(
  db: D1Database,
  finals: Record<string, number | null>,
  idempotencyKey: string | null,
): Promise<ProductionResult> {
  const products = await loadStockProducts(db);
  await getInventory(db, products);
  const now = Date.now();
  const opKey = idempotencyKey ? `adjustment:${idempotencyKey}` : null;

  if (opKey && (await findOperation(db, opKey))) {
    return { newInventory: await currentQuantities(db, products), replayed: true };
  }

  const keys = products.map((p) => p.key);
  const f = keys.map((k) => finals[k] ?? null);
  const statements: D1PreparedStatement[] = [];
  if (opKey) statements.push(operationKeyStatement(db, opKey, 'STOCK_ADJUSTMENT', null, now));
  statements.push(
    db
      .prepare(
        `INSERT INTO stock_movement_history (${historyColumns(products)})
         SELECT ?, ?, 'STOCK_ADJUSTMENT', NULL,
           ${keys.map((k) => col(k)).join(', ')},
           ${keys.map((k) => `COALESCE(?, ${col(k)}) - ${col(k)}`).join(', ')},
           ${keys.map((k) => `COALESCE(?, ${col(k)})`).join(', ')}, ?
         FROM current_inventory WHERE id = ?`,
      )
      .bind(newId(), now, ...f, ...f, now, INVENTORY_ROW_ID),
    db
      .prepare(
        `UPDATE current_inventory SET ${keys.map((k) => `${col(k)} = COALESCE(?, ${col(k)})`).join(', ')}, updatedAt = ? WHERE id = ?`,
      )
      .bind(...f, now, INVENTORY_ROW_ID),
  );

  try {
    await db.batch(statements);
  } catch (error) {
    if (opKey && isUniqueViolation(error, 'operation_keys')) {
      return { newInventory: await currentQuantities(db, products), replayed: true };
    }
    throw error;
  }
  return { newInventory: await currentQuantities(db, products), replayed: false };
}

async function currentQuantities(db: D1Database, products: StockProduct[]): Promise<Quantities> {
  return (await getInventory(db, products)).quantities;
}
