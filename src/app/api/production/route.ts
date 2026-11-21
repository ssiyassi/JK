import { NextRequest, NextResponse } from 'next/server';
import { addProduction } from '@/lib/core/inventory';
import { loadStockProducts } from '@/lib/core/products';
import { loadProductCosting, meatPurchaseStatements, packsPerMeat, parseMeatPrices } from '@/lib/core/costs';
import { actor, errorResponse, getDB, idempotencyKey, log, readJson } from '@/lib/server';

// Same input handling as before: each field parsed as an integer, blank/invalid = 0.
const toInt = (v: unknown) => parseInt(String(v ?? '')) || 0;

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const db = getDB();
    const products = await loadStockProducts(db);
    const quantities = Object.fromEntries(products.map((p) => [p.key, toInt(body[p.key])]));
    // Meat price per meat type (babi / sapi): required for every meat that has packs in this production.
    const packs = packsPerMeat(quantities, await loadProductCosting(db));
    const meatPrices = parseMeatPrices(body, packs);
    const { newInventory, replayed } = await addProduction(db, quantities, idempotencyKey(request), (productionId, now) =>
      meatPurchaseStatements(db, productionId, now, meatPrices, packs),
    );
    log('info', replayed ? 'production_replayed' : 'production_added', { quantities, meatPrices, user: actor(request) });
    return NextResponse.json({ success: true, message: 'Production added successfully', newInventory });
  } catch (error) {
    return errorResponse(error, 'Failed to add production', { route: 'POST /api/production', user: actor(request) });
  }
}
