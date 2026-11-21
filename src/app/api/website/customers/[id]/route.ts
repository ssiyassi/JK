import { NextRequest, NextResponse } from 'next/server';
import { actor, errorResponse, getDB, log, readJson } from '@/lib/server';
import { setCustomerDisabled, updateCustomerByAdmin } from '@/lib/shop/customers';

/** Edit a customer's name/email/phone, or deactivate/reactivate them: { disabled: true | false }. */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await readJson(request);
    const db = getDB();
    if (typeof body.disabled === 'boolean') {
      const customer = await setCustomerDisabled(db, id, body.disabled, Date.now());
      log('info', body.disabled ? 'shop_customer_disabled' : 'shop_customer_enabled', { customer: id, user: actor(request) });
      return NextResponse.json({ success: true, customer });
    }
    const customer = await updateCustomerByAdmin(db, id, body, Date.now());
    log('info', 'shop_customer_updated', { customer: id, user: actor(request) });
    return NextResponse.json({ success: true, customer });
  } catch (error) {
    return errorResponse(error, 'Failed to save customer', { route: 'PATCH /api/website/customers/[id]', customer: id, user: actor(request) });
  }
}
