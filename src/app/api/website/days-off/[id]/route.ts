import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { removeDayOff, saveDayOff } from '@/lib/shop/days-off';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const dayOff = await saveDayOff(getDB(), { ...body, id }, Date.now());
    log('info', 'shop_day_off_changed', { id, startDate: dayOff.startDate, endDate: dayOff.endDate, user: actor(request) });
    return NextResponse.json({ success: true, dayOff });
  } catch (error) {
    return errorResponse(error, 'Failed to save the day off', { route: 'PUT /api/website/days-off/[id]', id, user: actor(request) });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    await removeDayOff(getDB(), id);
    log('info', 'shop_day_off_removed', { id, user: actor(request) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Failed to remove the day off', { route: 'DELETE /api/website/days-off/[id]', id, user: actor(request) });
  }
}
