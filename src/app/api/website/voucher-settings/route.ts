import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { saveVoucherRules } from '@/lib/shop/vouchers';

/** Saves the percent and max discount of the welcome, referral and monthly vouchers (for vouchers issued from now on). */
export async function PUT(request: NextRequest) {
  try {
    const rules = await saveVoucherRules(getDB(), await readJson(request), Date.now());
    log('info', 'shop_voucher_settings_saved', { rules, user: actor(request) });
    return NextResponse.json({ success: true, rules });
  } catch (error) {
    return errorResponse(error, 'Failed to save voucher settings', { route: 'PUT /api/website/voucher-settings', user: actor(request) });
  }
}
