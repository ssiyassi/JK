import { NextResponse } from 'next/server';
import { getInventory } from '@/lib/core/inventory';
import { errorResponse, getDB } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const inventory = await getInventory(getDB());
    return NextResponse.json({ ...inventory, timestamp: new Date().toISOString() });
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/inventory' });
  }
}
