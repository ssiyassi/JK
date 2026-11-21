import { NextRequest, NextResponse } from 'next/server';
import { resellerSalesReport } from '@/lib/core/resellers';
import { errorResponse, getDB } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const date = new URL(request.url).searchParams.get('date');
    return NextResponse.json(await resellerSalesReport(getDB(), date));
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/reseller-sales' });
  }
}
