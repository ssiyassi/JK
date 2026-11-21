import { NextResponse } from 'next/server';
import { listStockMovements } from '@/lib/core/inventory';
import { errorResponse, getDB } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await listStockMovements(getDB()));
  } catch (error) {
    return errorResponse(error, 'Failed to fetch stock movements', { route: 'GET /api/stock-movement' });
  }
}
