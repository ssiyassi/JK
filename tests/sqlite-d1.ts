// Test double for Cloudflare D1 backed by node:sqlite. batch() is one transaction, like D1.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result } from '../src/lib/core/d1.ts';

export function sqliteD1(path: string): D1Database & { raw: DatabaseSync } {
  const raw = new DatabaseSync(path);
  const make = (sql: string, params: unknown[] = []): D1PreparedStatement => ({
    bind: (...values: unknown[]) => make(sql, values),
    async first<T>() {
      return ((raw.prepare(sql).get(...(params as never[])) as T) ?? null);
    },
    async all<T>() {
      return { results: raw.prepare(sql).all(...(params as never[])) as T[], success: true, meta: {} } as D1Result<T>;
    },
    async run() {
      const r = raw.prepare(sql).run(...(params as never[]));
      return { results: [], success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return {
    raw,
    prepare: (sql: string) => make(sql),
    async batch(statements: D1PreparedStatement[]) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
