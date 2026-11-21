import Link from 'next/link';
import { orderDisplayLines } from '@/lib/shop/bundles';
import { notFound, redirect } from 'next/navigation';
import { getDB } from '@/lib/server';
import { formatDeliveryDate, formatRupiah, GOOGLE_REVIEW_URL, PAYMENT_INSTRUCTIONS, whatsappOrderLink } from '@/lib/shop/catalog';
import { onOrderPaid, TRANSFER_EXPIRE_AFTER_MS } from '@/lib/shop/events';
import { fullAddress, getShopOrder, isWalletMethod, mapsLink, WALLET_LABEL } from '@/lib/shop/orders';
import { findCourier } from '@/lib/shop/couriers';
import { listPayments, syncOrderPayment } from '@/lib/shop/payments';
import { afterAction, availableWallets, gatewayForMethod, currentCustomer, currentOwner, emailLinks, googleAdsPublic, ownerEmail, paymentGateways, shopBase, metaPurchase, telegram, viewableOrder } from '@/lib/shop/server';
import { log } from '@/lib/server';
import { displayPhone } from '@/lib/shop/util';
import CopyButton from '../../_components/CopyButton';
import CancelOrderButton from '../../_components/CancelOrderButton';
import PayButton from '../../_components/PayButton';
import OrderStepper from '../../_components/OrderStepper';
import OrderTracker from '../../_components/OrderTracker';
import OrderStickyBar from '../../_components/OrderStickyBar';
import { loadCatalog } from '@/lib/shop/products';
import ProofUpload from '../../_components/ProofUpload';
import ChangePaymentMethod from '../../_components/ChangePaymentMethod';
import OwnerPayTools from '../../_components/OwnerPayTools';
import { orderUrl } from '@/lib/shop/email';
import { payLinkWhatsApp } from '@/lib/shop/ownerOrders';
import GooglePurchase from '../../_components/GooglePurchase';
import MetaPurchase from '../../_components/MetaPurchase';
import RememberGuestOrder from '../../_components/RememberGuestOrder';
import { purchaseEventId } from '@/lib/notify/meta';

export const dynamic = 'force-dynamic';


export default async function OrderPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; from?: string }> }) {
  const [{ id }, search, base] = await Promise.all([props.params, props.searchParams, shopBase()]);
  // The account's own order, or one placed as a guest in this browser (or opened from the guest's email link).
  const found = await viewableOrder(id);
  if (!found) {
    if (!(await currentCustomer())) redirect(`${base}/login?next=${encodeURIComponent(`${base}/orders/${id}`)}`);
    notFound();
  }
  const { customer } = found;
  const db = getDB();
  let order = found.order;
  // Opened through the guest's key, not as the signed-in owner.
  const asGuest = !(customer && order.customerId === customer.id);

  // Online payment: ask the gateway directly whether an open payment went through (backup in case its
  // notification is late or lost).
  const gateways = paymentGateways();
  const payerEmail = customer?.email ?? order.contactEmail;
  const wallet = isWalletMethod(order.paymentMethod) ? order.paymentMethod : null; // OVO or ShopeePay (Duitku)
  const paysOvo = wallet === 'OVO';
  const gateway = gatewayForMethod(wallet ?? 'QRIS', payerEmail);
  const wallets = availableWallets(payerEmail);
  // Back from the payment page (Duitku adds its own parameters to the return URL).
  const fromPayment = /^(doku|duitku)\b/.test(search.from ?? '');
  let hasPaymentLink = false;
  if (gateway && order.orderStatus === 'ACTIVE' && order.paymentStatus === 'PENDING') {
    hasPaymentLink = (await listPayments(db, order.orderRowId)).length > 0;
    if (hasPaymentLink) {
      try {
        const results = await syncOrderPayment(db, gateways, order.orderRowId, Date.now());
        if (results.some((r) => r.kind === 'paid')) {
          const rowId = order.orderRowId;
          afterAction('payment_paid', () => onOrderPaid(db, rowId, ownerEmail(), emailLinks(), Date.now(), telegram(), metaPurchase()));
          order = (await getShopOrder(db, rowId))!;
        }
      } catch (error) {
        log('warn', 'payment_status_check_failed', { orderId: order.orderId, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const cancelled = order.orderStatus === 'CANCELLED';
  // The courier link (tracking, then often the proof of delivery) stays open until 48 hours after the order is delivered.
  const trackingUrl =
    !cancelled && order.trackingUrl && (order.deliveredAt === null || Date.now() - order.deliveredAt < 48 * 3600 * 1000) ? order.trackingUrl : null;
  const firstLine = order.lines[0];
  const photo = firstLine ? ((await loadCatalog(db)).find((c) => c.product === firstLine.product)?.image ?? null) : null;
  const courier = findCourier(order.courier);
  const googleSendTo = googleAdsPublic().purchaseSendTo;
  // Step the order is in: 0 waiting for payment, 1 paid / being prepared, 2 shipped (tracking link sent), 3 delivered.
  // Each step shows when the order entered it: placed, paid, shipped, marked delivered.
  const finished = order.deliveryStatus === 'DELIVERED';
  const current = finished ? 3 : order.shippedAt ? 2 : order.paymentStatus === 'PAID' ? 1 : 0;
  const stepTimes = [order.createdAt, order.paidAt, order.shippedAt, order.deliveredAt];
  const p = PAYMENT_INSTRUCTIONS;
  // Unpaid: manual transfer when the customer chose it (or there is no online payment), otherwise QRIS or an e-wallet.
  const unpaid = !cancelled && order.paymentStatus === 'PENDING';
  const showTransfer = unpaid && (!gateway || order.paymentMethod === 'TRANSFER');
  const showQris = unpaid && gateway !== null && !showTransfer;
  // Placed by the owner for the customer: no method picked yet, the customer chooses from the order link.
  const picksMethod = order.paymentMethod === null && order.placedByOwner !== null;
  // Admin mode in this browser: the owner's "Kirim link bayar" and QRIS tools.
  const owner = await currentOwner();
  const transferDeadline = new Date(order.createdAt + TRANSFER_EXPIRE_AFTER_MS).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="max-w-xl mx-auto space-y-4">
      {/* Only for recent payments, so reopening an old order never counts as a new purchase. */}
      {!owner && order.paymentStatus === 'PAID' && !cancelled && order.paidAt !== null && Date.now() - order.paidAt < 48 * 3600 * 1000 && (
        <>
          <MetaPurchase
            orderId={order.orderId}
            eventId={purchaseEventId(order.orderId)}
            value={order.total}
            items={order.lines.map((l) => ({ id: l.product, quantity: l.qty }))}
          />
          {googleSendTo && <GooglePurchase sendTo={googleSendTo} orderId={order.orderId} value={order.total} />}
        </>
      )}
      {asGuest && <RememberGuestOrder id={order.orderRowId} orderId={order.orderId} />}
      {search.new && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4">
          <p className="font-semibold text-green-900">Pesanan berhasil dibuat 🎉</p>
          <p className="text-sm text-green-800 mt-1">
            {!order.guestKey || order.contactEmail
              ? 'Detail pesanan juga sudah dikirim ke email Anda.'
              : 'Halaman pesanan ini tersimpan di browser ini. Simpan nomor pesanan Anda untuk menghubungi kami jika perlu.'}
          </p>
        </div>
      )}

      <header className="max-sm:hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 text-2xl leading-[30px] font-bold text-[#111827]">
          <h1>Pesanan</h1>
          <span className="tabular-nums">#{order.orderId}</span>
        </div>
        <p className="self-end text-sm leading-5 text-[#9ca3af]">
          {new Date(order.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </header>

      {cancelled ? (
        <div className="rounded-2xl bg-[#f1e7dd] p-4">
          <p className="font-semibold">Pesanan ini dibatalkan.</p>
          <p className="text-sm text-[#5c4d42] mt-1">
            {order.cancelReason === 'EXPIRED'
              ? 'Pembayaran tidak diselesaikan sebelum batas waktunya, sehingga pesanan dibatalkan otomatis.'
              : order.cancelReason === 'CUSTOMER'
                ? 'Anda telah membatalkan pesanan ini.'
                : 'Pesanan dibatalkan oleh Jentis Kitchen.'}
            {order.voucherCode ? ` Voucher ${order.voucherCode} bisa dipakai lagi.` : ''}
          </p>
        </div>
      ) : (
        <>
          <OrderTracker
            orderId={order.orderId}
            current={current as 0 | 1 | 2 | 3}
            finished={finished}
            times={stepTimes}
            deliveryDate={order.deliveryDate}
            paid={order.paymentStatus === 'PAID'}
            trackingUrl={trackingUrl}
            photo={photo}
          />
          <div className="hidden sm:block">
            <OrderStepper current={current as 0 | 1 | 2 | 3} finished={finished} times={stepTimes} />
          </div>
        </>
      )}

      {/* Delivered: ask for a Google review (helps the shop show up on Google Maps and search). */}
      {!cancelled && finished && (
        <a
          href={GOOGLE_REVIEW_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl bg-[#fdf3ea] border border-[#f3d9c4] p-4 flex items-center gap-3 hover:bg-[#fbe9d9]"
        >
          <span className="text-2xl" aria-hidden>⭐</span>
          <span className="flex flex-col">
            <span className="font-bold text-[#111827]">Suka dengan pesanannya?</span>
            <span className="text-sm text-[#5c4d42]">Kasih ulasan di Google — sangat membantu usaha kecil kami 🙏</span>
          </span>
        </a>
      )}

      {!cancelled && !finished && order.deliveryDate !== null && (
        <div className="max-sm:hidden rounded-2xl bg-[#fdf3ea] border border-[#f3d9c4] p-4 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🚚</span>
          <div>
            <p className="text-sm text-[#5c4d42]">{order.paymentStatus === 'PAID' ? 'Jadwal pengiriman' : 'Dikirim setelah pembayaran diterima, pada'}</p>
            <p className="font-bold text-[#111827]">{formatDeliveryDate(order.deliveryDate)}</p>
          </div>
        </div>
      )}

      {trackingUrl && (
        <section className="bg-white rounded-2xl border-2 border-[#2563eb] p-4 sm:p-5">
          <h2 className="font-semibold">Pengiriman pesanan 🚚</h2>
          {courier && <p className="text-sm text-[#5c4d42] mt-1">Dikirim dengan <b>{courier.name}</b></p>}
          {order.trackingNumber ? (
            <>
              <p className="text-sm text-[#5c4d42] mt-3">Nomor resi</p>
              <div className="mt-1 mb-2 flex items-center justify-between gap-2 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] px-3 py-2.5">
                <span className="font-mono font-bold text-lg tracking-wide break-all">{order.trackingNumber}</span>
                <CopyButton
                  text={order.trackingNumber}
                  label="Salin resi"
                  className="shrink-0 text-sm font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] px-3 py-2 rounded-lg"
                />
              </div>
              <p className="text-sm text-[#5c4d42] mb-4">Salin nomor resi, lalu tempel di halaman cek resi {courier?.name ?? 'kurir'}.</p>
            </>
          ) : (
            <p className="text-sm text-[#5c4d42] mt-1 mb-4">Lihat perjalanan pesanan Anda melalui link pengiriman dari kurir.</p>
          )}
          <a
            href={trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-center py-3.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold"
          >
            {order.trackingNumber ? `Cek resi di ${courier?.name ?? 'situs kurir'}` : 'Lacak pengiriman'}
          </a>
        </section>
      )}

      {!cancelled && order.paymentStatus === 'PAID' && (
        <a
          href={whatsappOrderLink(order.orderId)}
          target="_blank"
          rel="noreferrer"
          className="max-sm:hidden flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#25d366] hover:bg-[#1ebe5a] text-white font-semibold"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.5h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.45-9.43a9.4 9.4 0 0 1 9.43 9.44c0 5.2-4.24 9.44-9.44 9.44m8.03-17.47A11.3 11.3 0 0 0 12.05.7C5.79.7.7 5.79.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.3l5.72-1.5a11.3 11.3 0 0 0 5.42 1.38h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.03" />
          </svg>
          Hubungi Kami
        </a>
      )}

      {owner && unpaid && order.guestKey && (
        <OwnerPayTools
          orderRowId={order.orderRowId}
          whatsappHref={payLinkWhatsApp(order, orderUrl(order, emailLinks()), formatRupiah(order.total))}
          qris={paymentGateways().some((g) => g.name === 'doku')}
        />
      )}

      {showQris && gateway && (
        <section className="bg-white rounded-2xl border-2 border-[#9a3412] p-4 sm:p-5">
          <h2 className="font-semibold">Selesaikan pembayaran</h2>
          <p className="text-2xl font-bold mt-1">{formatRupiah(order.total)}</p>
          <p className="text-sm text-[#5c4d42] mt-1 mb-4">
            {picksMethod && !hasPaymentLink
              ? `Pilih cara bayar: QRIS, e-wallet atau transfer ${p.bank}. Bayar sebelum ${transferDeadline} WIB, setelah itu pesanan dibatalkan otomatis.`
              : fromPayment && hasPaymentLink && !paysOvo
              ? 'Pembayaran belum kami terima. Jika Anda sudah membayar, tunggu sebentar lalu muat ulang halaman ini.'
              : paysOvo
                ? 'Masukkan nomor HP OVO Anda di halaman pembayaran, lalu setujui di aplikasi OVO dalam 60 detik. Jika tidak dibayar dalam 3 menit, pesanan otomatis dibatalkan.'
                : wallet === 'SHOPEEPAY'
                  ? 'Buka halaman pembayaran dari HP yang ada aplikasi Shopee, lalu tekan "Buka aplikasi" untuk membayar dengan ShopeePay.'
                  : wallet === 'DANA'
                    ? 'Bayar menggunakan aplikasi DANA di halaman pembayaran.'
                    : `Bayar dengan aman melalui ${gateway.label}: ${gateway.methodsText}.`}
          </p>
          {picksMethod ? (
            <ChangePaymentMethod orderRowId={order.orderRowId} current="QRIS" total={order.total} wallets={wallets} label="Pilih metode pembayaran" primary />
          ) : (
            <>
              <PayButton orderRowId={order.orderRowId} label={`Lanjutkan dengan ${wallet ? WALLET_LABEL[wallet] : 'QRIS'}`} />
              <div className="mt-3">
                <ChangePaymentMethod orderRowId={order.orderRowId} current={wallet ?? 'QRIS'} total={order.total} wallets={wallets} />
              </div>
            </>
          )}
          <div className="mt-3">
            <CancelOrderButton orderRowId={order.orderRowId} voucherCode={order.voucherCode} />
          </div>
        </section>
      )}

      {!cancelled && order.paymentStatus === 'PAID' && fromPayment && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4">
          <p className="font-semibold text-green-900">Pembayaran berhasil ✓</p>
          <p className="text-sm text-green-800 mt-1">Terima kasih! Pesanan Anda sedang kami siapkan.</p>
        </div>
      )}

      {showTransfer && (
        <section className="bg-white rounded-2xl border-2 border-[#9a3412] p-4 sm:p-5">
          <h2 className="font-semibold">Transfer manual ke {p.bank}</h2>
          {order.proofUploadedAt === null && (
            <p className="text-sm text-[#5c4d42] mt-1">
              Transfer lalu unggah bukti transfer sebelum <span className="font-semibold text-[#111827]">{transferDeadline} WIB</span>. Tanpa bukti transfer, pesanan dibatalkan otomatis.
            </p>
          )}
          <p className="text-sm text-[#5c4d42] mt-3">Transfer tepat sejumlah:</p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xl font-bold">{formatRupiah(order.total)}</span>
            <CopyButton text={String(order.total)} />
          </div>
          <div className="mt-4 rounded-xl bg-[#faf6f1] p-3">
            <p className="text-sm text-[#5c4d42]">{p.bank}</p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-mono font-semibold">{p.accountNumber}</span>
              {/\d/.test(p.accountNumber) && <CopyButton text={p.accountNumber} />}
            </div>
            <p className="text-sm">a.n. {p.accountName}</p>
          </div>
          {p.qrisImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/shop${p.qrisImage}`} alt="QRIS Jentis Kitchen" className="mt-4 mx-auto max-w-[240px]" />
          )}
          <div className="mt-5">
            <ProofUpload orderRowId={order.orderRowId} uploaded={order.proofUploadedAt !== null} />
          </div>
          {gateway && order.proofUploadedAt === null && (
            <div className="mt-3">
              <ChangePaymentMethod orderRowId={order.orderRowId} current="TRANSFER" total={order.total} wallets={wallets} />
            </div>
          )}
          <div className="mt-3">
            <CancelOrderButton orderRowId={order.orderRowId} voucherCode={order.voucherCode} />
          </div>
        </section>
      )}

      <section className="bg-white rounded-2xl border border-[#eadfd5] p-4 sm:p-5">
        <h2 className="font-semibold mb-3">Rincian</h2>
        <ul className="text-sm space-y-2">
          {orderDisplayLines(order.lines).map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{l.label}</span>
              <span className="shrink-0">{formatRupiah(l.amount)}</span>
            </li>
          ))}
          <li className="flex justify-between pt-2 border-t border-[#f1e7dd]">
            <span>Subtotal</span>
            <span>{formatRupiah(order.subtotal)}</span>
          </li>
          {order.discount > 0 && (
            <li className="flex justify-between text-green-700">
              <span>Diskon ({order.voucherCode})</span>
              <span>−{formatRupiah(order.discount)}</span>
            </li>
          )}
          <li className="flex justify-between">
            <span>Ongkos kirim</span>
            <span>{order.deliveryFee ? formatRupiah(order.deliveryFee) : 'Gratis'}</span>
          </li>
          <li className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span>{formatRupiah(order.total)}</span>
          </li>
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-[#eadfd5] p-4 sm:p-5 text-sm">
        <h2 className="font-semibold mb-2 text-base">Dikirim ke</h2>
        <p className="font-medium">
          {order.recipientName} · {displayPhone(order.recipientPhone)}
        </p>
        <p className="text-[#5c4d42]">
          {fullAddress(order)}
        </p>
        {order.notes && <p className="text-[#5c4d42]">Catatan: {order.notes}</p>}
        {order.latitude !== null && order.longitude !== null && (
          <a href={mapsLink(order.latitude, order.longitude)} target="_blank" rel="noreferrer" className="text-[#9a3412]">
            Lihat titik lokasi
          </a>
        )}
      </section>

      {asGuest ? (
        <div className="text-center text-sm text-[#5c4d42] py-2 space-y-1">
          <p>Pesanan ini bisa dibuka lagi dari browser ini{order.contactEmail ? ' atau dari link di email Anda' : ''}.</p>
          <Link href={base || '/'} className="inline-block text-[#9a3412] font-semibold">
            Belanja lagi
          </Link>
        </div>
      ) : (
        <Link href={`${base}/pesanan`} className="block text-center text-sm text-[#9a3412] py-2">
          Lihat semua pesanan
        </Link>
      )}
      <OrderStickyBar
        orderId={order.orderId}
        lines={order.lines.map((l) => ({ product: l.product, qty: l.qty, ...(l.bundle ? { bundle: { id: l.bundle.id, key: l.bundle.key } } : {}) }))}
        reorder={cancelled || order.paymentStatus === 'PAID'}
      />
    </div>
  );
}
