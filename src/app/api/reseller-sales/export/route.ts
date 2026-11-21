import { NextRequest, NextResponse } from 'next/server';
import { resellerSalesCsv } from '@/lib/core/resellers';
import { errorResponse, getDB } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const date = new URL(request.url).searchParams.get('date');
    const csv = await resellerSalesCsv(getDB(), date);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="reseller-sales.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error, 'Internal server error', { route: 'GET /api/reseller-sales/export' });
  }
}
