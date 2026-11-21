import { NextRequest, NextResponse } from 'next/server';
import { AppError } from '@/lib/core/d1';
import { errorResponse, getDB, idempotencyKey, log, readJson } from '@/lib/server';
import { ATTRIBUTION_COOKIE, buildAttribution } from '@/lib/shop/attribution';
import { removeCheckoutLeads } from '@/lib/shop/checkoutLeads';
import { createPasswordSetupToken, getCustomer, SETUP_LINK_DAYS, type Buyer } from '@/lib/shop/customers';
import { checkoutWelcomeEmail, orderPlacedEmail, type Email } from '@/lib/shop/email';
import { isWalletMethod, parsePaymentMethod, placeOrder, WALLET_LABEL } from '@/lib/shop/orders';
import { paymentLinkFor } from '@/lib/shop/payments';
import { hitRateLimits, LIMITS } from '@/lib/shop/ratelimit';
import { activeGateway, assertSameOrigin, gatewayForMethod, clientIp, currentCustomer, currentOwner, emailLinks, newCityDelivery, sendEmailsInBackground, setGuestOrderCookie } from '@/lib/shop/server';
import { markOwnerOrder, ownerAttribution } from '@/lib/shop/ownerOrders';
import { normalizeEmail } from '@/lib/shop/util';
import { newCustomerDiscountUsed } from '@/lib/shop/new-customer';
import { issueVoucher } from '@/lib/shop/vouchers';

/**
 * Places a website order, signed in or as a guest. Guests may type an email (optional): it gets the order emails,
 * and if neither the email nor the delivery phone has an account yet, an account is made with the welcome voucher and
 * a "Buat password" link.
 * Admin mode ("Buat pesanan untuk pelanggan", body.ownerSource): the owner orders for a customer as a guest, with no
 * payment method yet (the customer picks it from the order link), 24 hours to pay and the source the owner picked.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDB();
    const now = Date.now();
    const body = await readJson(request);
    const owner = body.ownerSource !== undefined ? await currentOwner() : null;
    if (body.ownerSource !== undefined && !owner) throw new AppError(403, 'Mode admin sudah berakhir. Buka lagi dari admin → Website Orders.');
    // Admin mode always orders as a guest: never on an account the owner may be signed in to in this browser.
    const ownerSource = owner ? ownerAttribution(body.ownerSource, now) : null;
    const customer = owner ? null : await currentCustomer();
    // QRIS, OVO or ShopeePay (payment page), or manual bank transfer. Without an online gateway only transfer is possible.
    const gatewayReady = Boolean(activeGateway(null));
    const paymentMethod = owner ? 'QRIS' : gatewayReady && body.paymentMethod !== undefined ? parsePaymentMethod(body.paymentMethod) : gatewayReady ? 'QRIS' : 'TRANSFER';
    if (isWalletMethod(paymentMethod) && !gatewayForMethod(paymentMethod, customer?.email ?? (typeof body.email === 'string' ? body.email : null))) {
      throw new AppError(400, `Pembayaran ${WALLET_LABEL[paymentMethod]} belum tersedia. Silakan pilih cara lain.`);
    }
    let buyer: Buyer;
    if (customer) {
      await hitRateLimits(db, [LIMITS.order(customer.id)], now);
      buyer = customer;
    } else {
      const ip = clientIp(request);
      if (!owner) await hitRateLimits(db, [LIMITS.guestOrder(ip)], now);
      const email = typeof body.email === 'string' && body.email.trim() ? normalizeEmail(body.email) : null;
      // New accounts count toward the same per-IP sign-up limit as the register page; past it the order still goes
      // through, only without a new account.
      let createAccount = false;
      if (email) {
        try {
          await hitRateLimits(db, [LIMITS.register(ip)], now);
          createAccount = true;
        } catch {
          log('warn', 'shop_guest_account_limit', { ip });
        }
      }
      buyer = { guest: true, email, phone: null, createAccount };
    }

    const { order, replayed, newAccount } = await placeOrder(db, buyer, body, idempotencyKey(request), now, newCityDelivery());
    const contactEmail = customer ? customer.email : order.contactEmail;
    const gateway = paymentMethod === 'TRANSFER' ? null : gatewayForMethod(paymentMethod, contactEmail);
    if (owner) {
      if (!replayed) await markOwnerOrder(db, order.orderRowId, owner, ownerSource);
      order.paymentMethod = null;
    } else {
      await db.prepare('UPDATE shop_orders SET paymentMethod = ? WHERE orderRowId = ?').bind(paymentMethod, order.orderRowId).run();
      order.paymentMethod = paymentMethod;
    }
    if (!replayed) {
      await removeCheckoutLeads(db, order.recipientPhone).catch(() => {}); // they ordered: no reminder
      // Where the customer came from (ad tags, Meta IDs), for the Meta Purchase event and marketing reports.
      const attribution = owner ? null : buildAttribution({
        cookie: request.cookies.get(ATTRIBUTION_COOKIE)?.value,
        fbp: request.cookies.get('_fbp')?.value,
        fbc: request.cookies.get('_fbc')?.value,
        ip: clientIp(request),
        ua: request.headers.get('user-agent'),
      });
      if (attribution) {
        try {
          await db
            .prepare('UPDATE shop_orders SET attribution = ? WHERE orderRowId = ? AND attribution IS NULL')
            .bind(JSON.stringify(attribution), order.orderRowId)
            .run();
        } catch (error) {
          // Never fails the order itself.
          log('warn', 'shop_attribution_failed', { orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
        }
      }
      log('info', 'shop_order_placed', {
        orderId: order.orderId,
        total: order.total,
        voucher: Boolean(order.voucherCode),
        guest: Boolean(order.guestKey),
        newAccount: Boolean(newAccount),
        paymentMethod: owner ? null : paymentMethod,
        ...(owner ? { owner, source: typeof body.ownerSource === 'string' ? body.ownerSource : null } : {}),
      });
      if (contactEmail) sendEmailsInBackground(await customerEmails(order, contactEmail, newAccount, isWalletMethod(paymentMethod) ? WALLET_LABEL[paymentMethod] : (gateway?.methodsText ?? null), now));
    }

    // QRIS, OVO or ShopeePay: send the customer straight to the payment page. If the gateway is unavailable the order still exists; the
    // order page shows a "Bayar sekarang" button to try again. Manual transfer: the order page shows the bank account.
    let paymentUrl: string | null = null;
    if (gateway && !owner) {
      try {
        paymentUrl = await paymentLinkFor(db, gateway, order, customer, emailLinks(), now);
      } catch (error) {
        log('error', 'payment_checkout_failed', { gateway: gateway.name, orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
      }
    }
    const response = NextResponse.json({ success: true, id: order.orderRowId, orderId: order.orderId, guest: Boolean(order.guestKey), paymentUrl });
    // A guest can open the order (pay, cancel, follow it) from this browser.
    setGuestOrderCookie(response, request, order);
    return response;
  } catch (error) {
    return errorResponse(error, 'Pesanan gagal dibuat. Silakan coba lagi.', { route: 'POST shop/api/orders' });
  }
}

/**
 * The order email, plus for guests: the welcome voucher and "Buat password" link when the account was just made, or
 * the "Buat password" link inside the order email when the order joined an account that still has no password.
 * Problems here never fail the order (it already exists).
 */
async function customerEmails(
  order: Awaited<ReturnType<typeof placeOrder>>['order'],
  to: string,
  newAccount: Awaited<ReturnType<typeof placeOrder>>['newAccount'],
  onlineMethods: string | null,
  now: number,
): Promise<Email[]> {
  const db = getDB();
  const links = emailLinks();
  if (!order.guestKey) return [orderPlacedEmail(to, order, links, onlineMethods)];
  try {
    if (newAccount) {
      const token = await createPasswordSetupToken(db, newAccount.id, now);
      // The new-customer discount was used on this order (or earlier by this phone/email): no second voucher, only
      // the "Buat password" link in the order email.
      const used =
        order.newCustomerDiscount ||
        (await newCustomerDiscountUsed(db, { phones: [newAccount.phone], emails: [newAccount.email] }, order.orderRowId));
      const welcome = used ? null : await issueVoucher(db, { customerId: newAccount.id, kind: 'WELCOME', now });
      if (!welcome) return [orderPlacedEmail(to, order, links, onlineMethods, { token, days: SETUP_LINK_DAYS })];
      return [
        orderPlacedEmail(to, order, links, onlineMethods),
        checkoutWelcomeEmail(to, newAccount.name, welcome, token, SETUP_LINK_DAYS, links),
      ];
    }
    const account = order.customerId ? await getCustomer(db, order.customerId) : null;
    if (account && !account.hasPassword && account.disabledAt === null && account.email === to) {
      const token = await createPasswordSetupToken(db, account.id, now);
      return [orderPlacedEmail(to, order, links, onlineMethods, { token, days: SETUP_LINK_DAYS })];
    }
  } catch (error) {
    log('error', 'shop_guest_account_email_failed', { orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
  }
  return [orderPlacedEmail(to, order, links, onlineMethods)];
}
