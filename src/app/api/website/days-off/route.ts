import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { bookedWebsiteOrders, saveDayOff } from '@/lib/shop/days-off';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Paid website orders already booked from ?start= to ?end= (warning in the save pop-up). */
export async function GET(request: NextRequest) {
  try {
    const start = request.nextUrl.searchParams.get('start') ?? '';
    const end = request.nextUrl.searchParams.get('end') || start;
    if (!DATE.test(start) || !DATE.test(end)) throw new AppError(400, 'Please choose the days off');
    return NextResponse.json({ orders: await bookedWebsiteOrders(getDB(), start, end) });
  } catch (error) {
    return errorResponse(error, 'Failed to check orders', { route: 'GET /api/website/days-off', user: actor(request) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const dayOff = await saveDayOff(getDB(), { ...body, id: undefined }, Date.now());
    log('info', 'shop_day_off_added', { startDate: dayOff.startDate, endDate: dayOff.endDate, user: actor(request) });
    return NextResponse.json({ success: true, dayOff });
  } catch (error) {
    return errorResponse(error, 'Failed to save the day off', { route: 'POST /api/website/days-off', user: actor(request) });
  }
}
