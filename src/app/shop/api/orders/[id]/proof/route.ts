import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getDB, log, readJson } from '@/lib/server';
import { ownerProofEmail } from '@/lib/shop/email';
import { saveProof } from '@/lib/shop/orders';
import { orderContact } from '@/lib/shop/events';
import { websiteOrderProofMessage } from '@/lib/notify/telegram';
import { afterAction, assertSameOrigin, emailLinks, orderViewer, ownerEmail, sendEmailsInBackground, telegram } from '@/lib/shop/server';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    assertSameOrigin(request);
    const { customerId, guestKey } = await orderViewer(id);
    const body = await readJson(request);
    const db = getDB();
    const { order, first } = await saveProof(db, { customerId, guestKey }, id, body.image, Date.now());
    log('info', 'shop_payment_proof_uploaded', { orderId: order.orderId, first });
    // Telegram on every upload (a replaced proof needs checking again); the email only for the first one.
    const notify = telegram();
    afterAction('proof_telegram', async () => {
      await notify(websiteOrderProofMessage(order, `${emailLinks().adminUrl}/orders`, !first));
      return [];
    });
    const owner = ownerEmail();
    if (first && owner) {
      const { email } = await orderContact(db, order);
      sendEmailsInBackground([ownerProofEmail(owner, order, email ?? (order.guestKey ? 'guest, no email' : '-'), emailLinks())]);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error, 'Gagal mengunggah bukti transfer', { route: 'POST shop/api/orders/[id]/proof', id });
  }
}
