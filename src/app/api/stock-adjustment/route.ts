import { NextRequest, NextResponse } from 'next/server';
import { adjustStock } from '@/lib/core/inventory';
import { AppError } from '@/lib/core/d1';
import { loadStockProducts } from '@/lib/core/products';
import { actor, errorResponse, getDB, idempotencyKey, log, readJson } from '@/lib/server';

// Fix: a blank field now keeps the current stock value (the original intent); previously it caused an error.
function finalValue(v: unknown, field: string): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseInt(String(v));
  if (Number.isNaN(n)) throw new AppError(400, `${field} must be a whole number`);
  return n;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const db = getDB();
    const products = await loadStockProducts(db);
    const finals = Object.fromEntries(products.map((p) => [p.key, finalValue(body[p.key], p.label)]));
    const { newInventory, replayed } = await adjustStock(db, finals, idempotencyKey(request));
    log('info', replayed ? 'stock_adjustment_replayed' : 'stock_adjusted', { finals, user: actor(request) });
    return NextResponse.json({ success: true, message: 'Stock adjustment completed successfully', newInventory });
  } catch (error) {
    return errorResponse(error, 'Failed to adjust stock', { route: 'POST /api/stock-adjustment', user: actor(request) });
  }
}
