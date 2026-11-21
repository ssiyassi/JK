import { NextResponse } from 'next/server';
import { INVENTORY_ROW_ID } from '@/lib/core/d1';
import { getDB, log } from '@/lib/server';

export const dynamic = 'force-dynamic';

/** Health check: confirms the Worker runs, D1 answers, and the schema/inventory row are in place. */
export async function GET() {
  const started = Date.now();
  try {
    const db = getDB();
    const inv = await db.prepare('SELECT COUNT(*) AS n FROM current_inventory WHERE id = ?').bind(INVENTORY_ROW_ID).first<{ n: number }>();
    const ops = await db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'operation_keys'`).first<{ n: number }>();
    const ok = Number(inv?.n) === 1 && Number(ops?.n) === 1;
    return NextResponse.json(
      { status: ok ? 'ok' : 'degraded', database: 'ok', inventoryRow: Number(inv?.n) === 1, migrationsApplied: Number(ops?.n) === 1, latencyMs: Date.now() - started },
      { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    log('error', 'health_check_failed', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 });
  }
}
