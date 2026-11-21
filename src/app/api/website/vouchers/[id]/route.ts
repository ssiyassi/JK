import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { getCampaign, listCampaignCodes, setCodeDisabled, updateCampaign } from '@/lib/shop/campaigns';
import { AppError } from '@/lib/core/d1';

export const dynamic = 'force-dynamic';

/** The codes of a voucher with their status (used / deactivated / emailed). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const db = getDB();
    if (!(await getCampaign(db, id))) throw new AppError(404, 'Voucher not found');
    return NextResponse.json({ codes: await listCampaignCodes(db, id) });
  } catch (error) {
    return errorResponse(error, 'Failed to load codes', { route: 'GET /api/website/vouchers/[id]', campaign: id });
  }
}

/**
 * Edit a voucher (name, dates, limits…), { disabled: true | false } for the whole voucher,
 * or { codeId, disabled } for one code.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const db = getDB();
    const body = await readJson(request);
    const now = Date.now();
    if (typeof body.codeId === 'string' && typeof body.disabled === 'boolean') {
      await setCodeDisabled(db, id, body.codeId, body.disabled, now);
      log('info', body.disabled ? 'shop_voucher_code_disabled' : 'shop_voucher_code_enabled', { campaign: id, code: body.codeId, user: actor(request) });
      return NextResponse.json({ success: true });
    }
    const campaign = await updateCampaign(db, id, body, now);
    log('info', 'shop_voucher_updated', { campaign: id, disabled: body.disabled, user: actor(request) });
    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    return errorResponse(error, 'Failed to save voucher', { route: 'PATCH /api/website/vouchers/[id]', campaign: id, user: actor(request) });
  }
}
