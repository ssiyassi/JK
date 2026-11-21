// Minimal subset of Cloudflare's D1 API used by this app.
// Declared here (instead of pulling in @cloudflare/workers-types globally) so the business
// logic stays framework-free and can be tested against a local SQLite file.

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
  [key: string]: unknown;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Runs all statements in one transaction: if any statement fails, none are applied. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

/** The single inventory row the app has always updated. (The database also holds an 'initial' row, kept for history.) */
export const INVENTORY_ROW_ID = 'current';

/** Boxes per stock product, keyed by the product's column name (see products.ts). */
export type Quantities = Record<string, number>;

/** Dates are stored as integer milliseconds, exactly like the existing data. */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'bigint') return new Date(Number(value));
  if (typeof value === 'string') {
    if (/^-?\d+$/.test(value)) return new Date(Number(value));
    return new Date(value);
  }
  throw new Error(`Unexpected date value: ${String(value)}`);
}

export function toDateOrNull(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

export function newId(): string {
  // Existing rows use Prisma cuids; new rows use random UUIDs. Both are plain TEXT ids.
  return crypto.randomUUID();
}

export function isUniqueViolation(error: unknown, target?: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!/UNIQUE constraint failed/i.test(message)) return false;
  return target ? message.includes(target) : true;
}

export class AppError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Parse a non-negative whole number of boxes. */
export function parseQuantity(value: unknown, field: string): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw new AppError(400, `${field} must be a whole number`);
  return n;
}
