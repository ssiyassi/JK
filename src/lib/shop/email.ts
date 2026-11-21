// Email contents (framework-free). Sending happens in src/lib/shop/server.ts.
import { formatDeliveryDate, formatRupiah, GOOGLE_REVIEW_URL, orderConfirmationMessage, PAYMENT_INSTRUCTIONS, VOUCHER_RULES, whatsappLink } from './catalog.ts';
import { displayPhone } from './util.ts';
import { fullAddress, mapsLink, type ShopOrder } from './orders.ts';
import type { Voucher } from './vouchers.ts';
import { shortDate, type RewardRecap } from '../notify/reseller-recap.ts';
import { AD_TAX_PERCENT, type MonthlyProfit } from '../core/costs.ts';
import { findCourier } from './couriers.ts';
import { orderDisplayLines } from './bundles.ts';

export interface Email {
  to: string;
  subject: string;
  html: string;
  /** Set when the email delivers a voucher, so it can be marked as sent. */
  voucherId?: string;
  /** Set when the email delivers an email-blast voucher code (admin voucher), so it can be marked as sent. */
  campaignCodeId?: string;
}

export interface EmailLinks {
  shopUrl: string; // e.g. https://jentiskitchen.id
  adminUrl: string; // e.g. https://admin.jentiskitchen.id
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f0ea;font-family:Arial,Helvetica,sans-serif;color:#2b211b">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-size:20px;font-weight:bold;color:#9a3412;margin-bottom:16px">Jentis Kitchen</div>
<div style="background:#ffffff;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${body}
</div>
<p style="font-size:12px;color:#8a7a6d;margin-top:16px">Email ini dikirim otomatis oleh jentiskitchen.id.</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#9a3412;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;
}

/** Link to an order: guest orders get their private link (opens the order without signing in). */
export function orderUrl(o: ShopOrder, links: EmailLinks): string {
  return o.guestKey
    ? `${links.shopUrl}/orders/${o.orderRowId}/open?k=${encodeURIComponent(o.guestKey)}`
    : `${links.shopUrl}/orders/${o.orderRowId}`;
}

function voucherBox(v: Voucher): string {
  const expiry = v.expiresAt
    ? `Berlaku sampai ${new Date(v.expiresAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' })}.`
    : 'Tidak ada batas waktu.';
  return `<div style="border:2px dashed #9a3412;border-radius:10px;padding:16px;text-align:center;margin:16px 0">
<div style="font-size:13px;color:#8a7a6d">Kode voucher Anda</div>
<div style="font-size:26px;font-weight:bold;letter-spacing:2px;margin:6px 0">${esc(v.code)}</div>
<div style="font-size:14px">Diskon ${v.percent}% (maksimal ${formatRupiah(v.capAmount)})</div>
</div>
<p style="font-size:13px;color:#5c4d42">${expiry} Hanya bisa dipakai sekali oleh akun Anda, untuk harga produk (tidak termasuk ongkir).</p>`;
}

function itemsTable(o: ShopOrder): string {
  const rows = orderDisplayLines(o.lines)
    .map((l) => `<tr><td style="padding:4px 0">${esc(l.label)}</td><td style="text-align:right">${formatRupiah(l.amount)}</td></tr>`)
    .join('');
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0${bold ? ';font-weight:bold' : ''}">${label}</td><td style="text-align:right${bold ? ';font-weight:bold' : ''}">${value}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}
<tr><td colspan="2" style="border-top:1px solid #eadfd5;padding-top:4px"></td></tr>
${line('Subtotal', formatRupiah(o.subtotal))}
${o.discount ? line(`Diskon${o.voucherCode ? ` (${esc(o.voucherCode)})` : ''}`, '−' + formatRupiah(o.discount)) : ''}
${line('Ongkos kirim', o.deliveryFee ? formatRupiah(o.deliveryFee) : 'Gratis')}
${line('Total', formatRupiah(o.total), true)}</table>`;
}

/** "Pesanan akan dikirim pada Jumat, 16 Oktober 2026" (nothing for old orders without a delivery date). */
function deliveryNote(o: ShopOrder, prefix: string): string {
  if (o.deliveryDate === null) return '';
  return `<p style="margin:16px 0;padding:12px 14px;background:#fdf3ea;border-radius:8px;font-size:14px">🚚 ${prefix} <b>${esc(formatDeliveryDate(o.deliveryDate))}</b>.</p>`;
}

function addressBlock(o: ShopOrder): string {
  const pin = o.latitude !== null && o.longitude !== null ? `<br><a href="${esc(mapsLink(o.latitude, o.longitude))}">Lihat titik lokasi di peta</a>` : '';
  return `<p style="font-size:14px;line-height:1.5"><b>${esc(o.recipientName)}</b> · ${esc(displayPhone(o.recipientPhone))}<br>
${esc(fullAddress(o))}${o.notes ? `<br>Catatan: ${esc(o.notes)}` : ''}${pin}</p>`;
}

// ---------------------------------------------------------------------------
// Customer emails
// ---------------------------------------------------------------------------

export function welcomeEmail(to: string, name: string, v: Voucher, links: EmailLinks, referralPercent: number = VOUCHER_RULES.REFERRAL.percent): Email {
  return {
    to,
    voucherId: v.id,
    subject: `Selamat datang di Jentis Kitchen — voucher ${v.percent}% untuk Anda`,
    html: layout(
      `Halo ${name}, selamat datang!`,
      `<p>Terima kasih sudah mendaftar. Sebagai hadiah, ini voucher diskon ${v.percent}% untuk pesanan Anda:</p>
${voucherBox(v)}
<p>Ajak teman mendaftar dengan memasukkan <b>nomor HP Anda</b> sebagai referral. Setelah pesanan pertama mereka diterima, Anda mendapat voucher ${referralPercent}%.</p>
${button(links.shopUrl, 'Belanja sekarang')}`,
    ),
  };
}

/** "Buat password" link for an account made at guest checkout (reset-password page in setup mode). */
function setupUrl(token: string, links: EmailLinks): string {
  return `${links.shopUrl}/reset-password?token=${encodeURIComponent(token)}&setup=1`;
}

/**
 * After a guest checkout with a new email: the account was made from the order details. Brings the welcome voucher and
 * the link to set a password (the only step left to sign in).
 */
export function checkoutWelcomeEmail(
  to: string,
  name: string,
  v: Voucher,
  setupToken: string,
  setupDays: number,
  links: EmailLinks,
): Email {
  return {
    to,
    voucherId: v.id,
    subject: `Akun Jentis Kitchen Anda sudah dibuat — voucher ${v.percent}% untuk Anda`,
    html: layout(
      `Halo ${name}, selamat datang!`,
      `<p>Terima kasih sudah berbelanja. Akun Jentis Kitchen Anda sudah kami buatkan dengan email ini, dan ini voucher diskon ${v.percent}% untuk pesanan berikutnya:</p>
${voucherBox(v)}
<p>Tinggal satu langkah: buat password supaya Anda bisa masuk, melihat semua pesanan, dan memakai voucher Anda.</p>
${button(setupUrl(setupToken, links), 'Buat password')}
<p style="font-size:13px;color:#5c4d42">Link berlaku ${setupDays} hari. Setelah itu, pakai "Lupa password" di halaman Masuk. Jika Anda tidak memesan di Jentis Kitchen, abaikan saja email ini.</p>`,
    ),
  };
}

/** Sign-up with an email whose account was made at guest checkout and has no password yet. */
export function passwordSetupEmail(to: string, name: string, setupToken: string, setupDays: number, links: EmailLinks): Email {
  return {
    to,
    subject: 'Buat password akun Jentis Kitchen Anda',
    html: layout(
      `Halo ${name}`,
      `<p>Akun Jentis Kitchen dengan email ini sudah ada (dibuat saat Anda memesan). Anda tinggal membuat password:</p>
${button(setupUrl(setupToken, links), 'Buat password')}
<p style="font-size:13px;color:#5c4d42">Link berlaku ${setupDays} hari. Jika Anda tidak meminta ini, abaikan saja email ini.</p>`,
    ),
  };
}

export function monthlyVoucherEmail(to: string, name: string, v: Voucher, links: EmailLinks): Email {
  return {
    to,
    voucherId: v.id,
    subject: `Voucher bulanan ${v.percent}% dari Jentis Kitchen`,
    html: layout(
      `Halo ${name}, ini voucher bulan ini`,
      `<p>Voucher diskon ${v.percent}% khusus untuk Anda bulan ini:</p>${voucherBox(v)}${button(links.shopUrl, 'Belanja sekarang')}`,
    ),
  };
}

export function referralRewardEmail(to: string, name: string, friendName: string, v: Voucher, links: EmailLinks): Email {
  return {
    to,
    voucherId: v.id,
    subject: `Terima kasih sudah mengajak ${friendName} — voucher ${v.percent}% untuk Anda`,
    html: layout(
      `Halo ${name}, referral Anda berhasil!`,
      `<p>Pesanan pertama ${esc(friendName)} sudah diterima. Sebagai terima kasih, ini voucher diskon ${v.percent}% untuk Anda:</p>${voucherBox(v)}${button(links.shopUrl, 'Belanja sekarang')}`,
    ),
  };
}

/** Email-blast voucher (admin voucher): one personal code per email address. */
export function campaignVoucherEmail(
  to: string,
  name: string | null,
  v: { codeId: string; code: string; title: string; discountText: string; minOrder: number; startsAt: number; endsAt: number },
  links: EmailLinks,
): Email {
  const day = (ms: number) => new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  const valid = v.startsAt > Date.now() ? `Berlaku ${day(v.startsAt)} sampai ${day(v.endsAt)}.` : `Berlaku sampai ${day(v.endsAt)}.`;
  const min = v.minOrder ? ` Minimal belanja produk ${formatRupiah(v.minOrder)}.` : '';
  return {
    to,
    campaignCodeId: v.codeId,
    subject: `${v.title}: voucher ${v.discountText} dari Jentis Kitchen`,
    html: layout(
      `Halo ${name ?? 'Kak'}, ada voucher untuk Anda`,
      `<p>${esc(v.title)} — voucher khusus untuk Anda:</p>
<div style="border:2px dashed #9a3412;border-radius:10px;padding:16px;text-align:center;margin:16px 0">
<div style="font-size:13px;color:#8a7a6d">Kode voucher Anda</div>
<div style="font-size:26px;font-weight:bold;letter-spacing:2px;margin:6px 0">${esc(v.code)}</div>
<div style="font-size:14px">${esc(v.discountText)}</div>
</div>
<p style="font-size:13px;color:#5c4d42">${valid}${min} Hanya bisa dipakai sekali, oleh akun dengan email ${esc(to)}, untuk harga produk (tidak termasuk ongkir).</p>
${button(links.shopUrl, 'Belanja sekarang')}`,
    ),
  };
}

/** The 6-digit code that confirms a new customer's email (and unlocks the welcome voucher). */
export function emailCodeEmail(to: string, name: string, code: string, minutes: number, welcomePercent: number): Email {
  return {
    to,
    subject: `${code} adalah kode konfirmasi Jentis Kitchen Anda`,
    html: layout(
      `Halo ${name}`,
      `<p>Masukkan kode ini di halaman konfirmasi email untuk mengaktifkan voucher selamat datang ${welcomePercent}% Anda:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:24px 0;color:#9a3412">${esc(code)}</p>
<p style="font-size:13px;color:#5c4d42">Kode berlaku ${minutes} menit. Jangan berikan kode ini kepada siapa pun. Jika Anda tidak mendaftar di Jentis Kitchen, abaikan saja email ini.</p>`,
    ),
  };
}

export function passwordResetEmail(to: string, name: string, token: string, links: EmailLinks): Email {
  return {
    to,
    subject: 'Reset password akun Jentis Kitchen',
    html: layout(
      `Halo ${name}`,
      `<p>Kami menerima permintaan untuk mengganti password akun Anda. Klik tombol di bawah dalam 1 jam:</p>
${button(`${links.shopUrl}/reset-password?token=${encodeURIComponent(token)}`, 'Buat password baru')}
<p style="font-size:13px;color:#5c4d42">Jika Anda tidak meminta ini, abaikan saja email ini. Password Anda tidak berubah.</p>`,
    ),
  };
}

/**
 * onlineMethods: what the payment page offers (online payment), or null for manual bank transfer.
 * setup: a guest's order joined an account that has no password yet: adds the "Buat password" link.
 */
export function orderPlacedEmail(
  to: string,
  o: ShopOrder,
  links: EmailLinks,
  onlineMethods: string | null,
  setup?: { token: string; days: number },
): Email {
  const p = PAYMENT_INSTRUCTIONS;
  const payment =
    onlineMethods
      ? `<p style="margin-top:20px">Selesaikan pembayaran <b>${formatRupiah(o.total)}</b> dengan ${esc(onlineMethods)}:</p>
${button(orderUrl(o, links), 'Bayar sekarang')}`
      : `<p style="margin-top:20px">Silakan transfer <b>${formatRupiah(o.total)}</b> ke:</p>
<p style="font-size:15px;line-height:1.5"><b>${esc(p.bank)} ${esc(p.accountNumber)}</b><br>a.n. ${esc(p.accountName)}</p>
<p>Lalu unggah bukti transfer di halaman pesanan:</p>
${button(orderUrl(o, links), 'Unggah bukti transfer')}`;
  return {
    to,
    subject: `Pesanan #${o.orderId} — menunggu pembayaran ${formatRupiah(o.total)}`,
    html: layout(
      `Terima kasih, pesanan #${o.orderId} sudah kami terima`,
      `${itemsTable(o)}
${deliveryNote(o, 'Setelah pembayaran diterima, pesanan dikirim pada')}
${payment}
<h2 style="font-size:16px">Dikirim ke</h2>${addressBlock(o)}${
        setup
          ? `<p style="margin-top:20px">Pesanan ini tersimpan di akun Jentis Kitchen dengan email ini. Buat password untuk masuk dan melihat semua pesanan Anda:</p>
${button(setupUrl(setup.token, links), 'Buat password')}
<p style="font-size:13px;color:#5c4d42">Link berlaku ${setup.days} hari.</p>`
          : ''
      }`,
    ),
  };
}

export function paymentConfirmedEmail(to: string, o: ShopOrder, links: EmailLinks): Email {
  return {
    to,
    subject: `Pembayaran pesanan #${o.orderId} sudah kami terima`,
    html: layout(
      'Pembayaran diterima — pesanan sedang disiapkan',
      `<p>Terima kasih! Pembayaran untuk pesanan #${o.orderId} sudah kami konfirmasi. Kami akan memberi kabar lagi saat pesanan sudah diterima.</p>
${deliveryNote(o, 'Pesanan akan dikirim pada')}
${itemsTable(o)}${button(orderUrl(o, links), 'Lihat pesanan')}`,
    ),
  };
}

export function shippedEmail(to: string, o: ShopOrder, links: EmailLinks): Email {
  const courier = findCourier(o.courier);
  const tracking = o.trackingNumber && o.trackingUrl
    ? `<p>Dikirim dengan <b>${esc(courier?.name ?? 'kurir')}</b>. Nomor resi Anda:</p>
<p style="font-size:22px;font-weight:bold;letter-spacing:1px;font-family:monospace">${esc(o.trackingNumber)}</p>
<p>Salin nomor resi di atas, lalu tempel di halaman cek resi ${esc(courier?.name ?? 'kurir')}:</p>
${button(o.trackingUrl, `Cek resi di ${courier?.name ?? 'situs kurir'}`)}`
    : o.trackingUrl
    ? `${courier ? `<p>Dikirim dengan <b>${esc(courier.name)}</b>.</p>
` : ''}<p>Lacak posisi pesanan Anda di sini:</p>
${button(o.trackingUrl, 'Lacak pengiriman')}
<p style="font-size:12px;color:#8a7a6d;word-break:break-all">Atau buka link ini: <a href="${esc(o.trackingUrl)}">${esc(o.trackingUrl)}</a></p>`
    : '';
  return {
    to,
    subject: `Pesanan #${o.orderId} sedang dikirim`,
    html: layout(
      'Pesanan Anda sedang dalam perjalanan',
      `<p>Pesanan #${o.orderId} sudah kami kirim ke alamat berikut:</p>${addressBlock(o)}
${tracking}
<p><a href="${esc(orderUrl(o, links))}">Lihat detail pesanan</a></p>`,
    ),
  };
}

/** The owner moved the delivery day of an order (usually because the customer asked). */
export function deliveryDateChangedEmail(to: string, o: ShopOrder, previousDate: number | null, links: EmailLinks): Email {
  const previous = previousDate === null ? '' : `<p style="font-size:14px;color:#8a7a6d">Tanggal sebelumnya: ${esc(formatDeliveryDate(previousDate))}</p>`;
  return {
    to,
    subject: `Tanggal pengiriman pesanan #${o.orderId} diubah`,
    html: layout(
      'Tanggal pengiriman diubah',
      `<p>Tanggal pengiriman pesanan #${o.orderId} sudah kami ubah.</p>
${deliveryNote(o, o.paymentStatus === 'PAID' ? 'Pesanan akan dikirim pada' : 'Dikirim setelah pembayaran diterima, pada')}
${previous}
<p>Jika tanggal ini tidak sesuai, silakan hubungi kami.</p>${button(orderUrl(o, links), 'Lihat pesanan')}`,
    ),
  };
}

/** Cancelled: because the payment was not completed in time (EXPIRED) or by the shop (ADMIN). */
export function orderCancelledEmail(to: string, o: ShopOrder, reason: 'EXPIRED' | 'ADMIN' | 'CUSTOMER', links: EmailLinks): Email {
  const why =
    reason === 'EXPIRED'
      ? 'Pembayaran untuk pesanan ini tidak diselesaikan sebelum batas waktunya, sehingga pesanan dibatalkan secara otomatis.'
      : reason === 'CUSTOMER'
        ? 'Anda telah membatalkan pesanan ini. Tidak ada pembayaran yang ditagihkan.'
        : 'Pesanan ini dibatalkan oleh Jentis Kitchen. Jika ada pertanyaan, silakan hubungi kami.';
  const voucher = o.voucherCode ? `<p>Voucher <b>${esc(o.voucherCode)}</b> yang Anda pakai bisa digunakan lagi.</p>` : '';
  return {
    to,
    subject: reason === 'EXPIRED' ? `Pesanan #${o.orderId} dibatalkan: pembayaran kedaluwarsa` : `Pesanan #${o.orderId} dibatalkan`,
    html: layout(
      `Pesanan #${o.orderId} dibatalkan`,
      `<p>${why}</p>${itemsTable(o)}${voucher}
<p>Anda tetap bisa memesan lagi kapan saja.</p>${button(links.shopUrl, 'Pesan lagi')}`,
    ),
  };
}

export function deliveredEmail(to: string, o: ShopOrder, links: EmailLinks): Email {
  return {
    to,
    subject: `Pesanan #${o.orderId} sudah diterima`,
    html: layout(
      'Pesanan Anda sudah sampai',
      `<p>Pesanan #${o.orderId} sudah diantar ke alamat berikut:</p>${addressBlock(o)}
<p>Selamat menikmati, dan terima kasih sudah berbelanja di Jentis Kitchen!</p>
<p>Suka dengan pesanannya? Ulasan singkat di Google sangat membantu usaha kecil kami dikenal lebih banyak orang 🙏</p>
${button(GOOGLE_REVIEW_URL, 'Kasih ulasan di Google ⭐')}
<p style="margin:0">Mau pesan lagi? <a href="${esc(links.shopUrl)}" style="color:#9a3412;font-weight:bold">Belanja di Jentis Kitchen</a></p>`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Owner emails
// ---------------------------------------------------------------------------

export function ownerProofEmail(to: string, o: ShopOrder, customerEmail: string, links: EmailLinks): Email {
  return {
    to,
    subject: `[Cek pembayaran] Pesanan web #${o.orderId} — ${formatRupiah(o.total)}`,
    html: layout(
      `Bukti transfer masuk: #${o.orderId}`,
      `<p>Pelanggan ${esc(customerEmail)} mengunggah bukti transfer. Cek mutasi rekening, lalu klik <b>Confirm paid</b> di admin.</p>
${itemsTable(o)}<h2 style="font-size:16px">Dikirim ke</h2>${addressBlock(o)}
${button(`${links.adminUrl}/orders`, 'Buka Orders')}`,
    ),
  };
}

/** Green WhatsApp button with the order confirmation message for the recipient (same as Website Orders in the admin). */
function whatsappButton(o: ShopOrder): string {
  const href = whatsappLink(
    o.recipientPhone,
    orderConfirmationMessage({ customerName: o.recipientName, lines: o.lines, address: fullAddress(o), deliveryDate: o.deliveryDate }),
  );
  return `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#128C7E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">WhatsApp ${esc(o.recipientName)} untuk konfirmasi</a></p>`;
}

/** Paid website order: the owner confirms it with the recipient on WhatsApp in one tap. */
export function ownerPaidEmail(to: string, o: ShopOrder, customerEmail: string, links: EmailLinks): Email {
  return {
    to,
    subject: `[PAID] Pesanan web #${o.orderId} — ${formatRupiah(o.total)}`,
    html: layout(
      `Pesanan baru, sudah dibayar: #${o.orderId}`,
      `<p>Status pembayaran: <b>PAID</b>. Pelanggan: ${esc(customerEmail)}.</p>
${itemsTable(o)}<h2 style="font-size:16px">Dikirim ke</h2>${addressBlock(o)}
${whatsappButton(o)}`,
    ),
  };
}

/** Sunday reward recap for the owner: one short card per reseller with a one-tap WhatsApp button (message prefilled). */
export function resellerRecapEmail(to: string, recap: RewardRecap, links: EmailLinks): Email {
  const week = `${shortDate(recap.week.start)} - ${shortDate(recap.week.end)}`;
  const missing = recap.resellers.filter((r) => !r.phone).length;
  const cards = recap.resellers
    .map((r) => {
      const reset = r.cycleBoxes !== r.periodBoxes ? ` (total ${r.periodBoxes}, dihitung ulang dari 0 setiap 100)` : '';
      return `<div style="border:1px solid #eadfd5;border-radius:10px;padding:12px 14px;margin:0 0 10px">
<div style="font-size:16px;font-weight:bold">${esc(r.reseller)}${r.parentReseller ? ` <span style="font-weight:normal;color:#8a7a6d;font-size:13px">· parent ${esc(r.parentReseller)}</span>` : ''}</div>
<div style="font-size:13px;color:#5c4d42;margin:4px 0 0">Minggu ini: <b>${r.weekBoxes}</b> box · Periode: <b>${r.cycleBoxes}</b> box${esc(reset)}</div>
${r.earned ? `<div style="font-size:13px;color:#9a3412;font-weight:bold;margin:4px 0 0">Reward: ${esc(r.earned)}</div>` : ''}
<p style="margin:10px 0 0"><a href="${esc(r.whatsappUrl)}" style="background:#25D366;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;display:inline-block">WhatsApp ${esc(r.reseller)}</a>${r.phone ? '' : ' <span style="font-size:12px;color:#b45309">Nomor belum ada: pilih kontak sendiri di WhatsApp.</span>'}</p>
</div>`;
    })
    .join('');
  const body = recap.resellers.length
    ? `<p>Minggu ${esc(week)} · periode reward ${esc(recap.period.label)}. ${recap.resellers.length} reseller dengan penjualan di periode ini.${missing ? ` ${missing} belum punya nomor WhatsApp (isi di <a href="${esc(links.adminUrl)}/my-resellers">My Resellers</a>).` : ''}</p>${cards}`
    : `<p>Belum ada reseller dengan penjualan di periode ${esc(recap.period.label)}.</p>`;
  return {
    to,
    subject: `Reseller recap ${week} — periode ${recap.period.short}`,
    html: layout(`Reseller recap ${week}`, body),
  };
}

/**
 * Announcement to all resellers (My Resellers → Announcement): one card per reseller with a WhatsApp button that opens
 * the chat with the message filled in. Each button carries the whole message, so the list is split over several
 * emails of `perEmail` resellers: Gmail cuts off emails above about 100 KB and would hide the last buttons.
 */
export function resellerAnnouncementEmails(
  to: string,
  message: string,
  resellers: { reseller: string; parentReseller: string | null; phone: string | null }[],
  adminUrl: string,
  perEmail = 40,
): Email[] {
  const parts: (typeof resellers)[] = [];
  for (let i = 0; i < resellers.length; i += perEmail) parts.push(resellers.slice(i, i + perEmail));
  const preview = message.length > 600 ? `${message.slice(0, 600)}…` : message;
  return parts.map((part, i) => {
    const range = `${i * perEmail + 1}–${i * perEmail + part.length}`;
    const cards = part
      .map((r) => {
        const text = message.replace(/\{\{\s*(reseller name|reseller|nama)\s*\}\}/gi, r.reseller);
        const href = `https://wa.me/${r.phone ?? ''}?text=${encodeURIComponent(text)}`;
        return `<div style="border:1px solid #eadfd5;border-radius:10px;padding:10px 12px;margin:0 0 8px">
<span style="font-size:15px;font-weight:bold">${esc(r.reseller)}</span>${r.parentReseller ? ` <span style="color:#8a7a6d;font-size:12px">· parent ${esc(r.parentReseller)}</span>` : ''}
<p style="margin:8px 0 0"><a href="${esc(href)}" style="background:#25D366;color:#fff;text-decoration:none;padding:9px 14px;border-radius:8px;font-weight:bold;display:inline-block">WhatsApp ${esc(r.reseller)}</a>${r.phone ? '' : ' <span style="font-size:12px;color:#b45309">Nomor belum ada: pilih kontak sendiri.</span>'}</p>
</div>`;
      })
      .join('');
    const intro =
      i === 0
        ? `<p>Pengumuman untuk <b>${resellers.length}</b> reseller, dibagi dalam <b>${parts.length}</b> email. Ketuk tombol hijau, WhatsApp terbuka dengan pesan ini, lalu tekan kirim.</p>
<div style="white-space:pre-wrap;background:#e7ffdb;border:1px solid #c7e9b4;border-radius:8px;padding:10px 12px;font-size:13px;margin:0 0 16px">${esc(preview)}</div>`
        : `<p>Lanjutan pengumuman: reseller ${range} dari ${resellers.length}.</p>`;
    return {
      to,
      subject: `Pengumuman reseller — bagian ${i + 1} dari ${parts.length} (reseller ${range})`,
      html: layout(`Pengumuman reseller · bagian ${i + 1}/${parts.length}`, `${intro}${cards}<p style="font-size:12px;color:#8a7a6d">Nomor WhatsApp diubah di <a href="${esc(adminUrl)}/my-resellers">My Resellers</a>.</p>`),
    };
  });
}

/** 1st of the month: last month's profit for the owner (admin language: English). */
export function monthlyProfitEmail(to: string, p: MonthlyProfit, links: EmailLinks): Email {
  const rp = (n: number) => formatRupiah(Math.round(n));
  const row = (label: string, value: string, style = '') =>
    `<tr><td style="padding:6px 0;${style}">${esc(label)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap;${style}">${esc(value)}</td></tr>`;
  const red = 'color:#b91c1c';
  const sold = p.lines.reduce((t, l) => t + l.soldPacks, 0);
  const free = p.lines.reduce((t, l) => t + l.freePacks, 0);
  const summary = `<table style="width:100%;border-collapse:collapse;font-size:15px">
${row(`Reseller sales (${p.resellerOrders} orders)`, rp(p.resellerSales))}
${row(`Website sales (${p.websiteOrders} orders)`, rp(p.websiteSales))}
${row('Total sales', rp(p.sales), 'font-weight:bold;border-top:1px solid #eadfd5')}
${row(`HPP of packs sold (${sold} packs)`, `- ${rp(p.hppSold)}`, red)}
${row(`Free reward boxes (${free} packs)`, `- ${rp(p.freeBoxCost)}`, red)}
${row('Payment fee (website)', `- ${rp(p.paymentFees)}`, red)}
${row('Delivery fees paid by website customers', `+ ${rp(p.deliveryCharged)}`)}
${row('Delivery fees you paid', `- ${rp(p.courierFees)}`, red)}
${row(`Ad spend Meta + Google (incl. ${AD_TAX_PERCENT}% PPN)`, `- ${rp(p.adSpend + p.adTax)}`, red)}
${row('Profit', rp(p.profit), `font-size:18px;font-weight:bold;border-top:2px solid #2b211b;color:${p.profit < 0 ? '#b91c1c' : '#15803d'}`)}
</table>`;
  const perProduct = p.lines
    .filter((l) => l.soldPacks + l.freePacks > 0 || l.hpp !== null)
    .map((l) => `<tr><td style="padding:4px 0">${esc(l.label)}</td><td style="padding:4px 0;text-align:right">${l.soldPacks}${l.freePacks ? ` + ${l.freePacks} free` : ''}</td><td style="padding:4px 0;text-align:right;white-space:nowrap">${l.hpp === null ? '—' : esc(rp(l.hpp))}</td></tr>`)
    .join('');
  const products = `<h2 style="font-size:16px;margin:24px 0 8px">Per product</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="color:#8a7a6d"><td>Product</td><td style="text-align:right">Packs</td><td style="text-align:right">HPP / pack</td></tr>${perProduct}</table>`;
  const warning = p.missingHpp.length
    ? `<p style="color:#b91c1c;font-size:14px">No complete HPP for ${esc(p.missingHpp.join(', '))}: their cost is counted as 0, so the profit is too high. Check the HPP page.</p>`
    : '';
  const courierWarning = p.missingCourierFee.length
    ? `<p style="color:#b91c1c;font-size:14px">${p.missingCourierFee.length} delivered/shipped order(s) have no delivery fee yet (#${esc(p.missingCourierFee.join(', #'))}): counted as 0. Add it on the Orders page.</p>`
    : '';
  const note = `<p style="font-size:12px;color:#8a7a6d;margin-top:16px">Orders by order date, cancelled orders left out, website orders once paid. Cash rewards are not included.</p>`;
  return {
    to,
    subject: `Profit ${p.label}: ${rp(p.profit)}`,
    html: layout(`Profit ${p.label}`, `${summary}${warning}${courierWarning}${products}${note}${button(`${links.adminUrl}/inventory/hpp?month=${p.month}`, 'Open HPP & Profit')}`),
  };
}

/** The code that unlocks the HPP & Profit pages in the admin. */
export function hppOtpEmail(to: string, code: string): Email {
  return {
    to,
    subject: `HPP code: ${code}`,
    html: layout('Your HPP & Profit code', `<p>Enter this code in the admin to open the HPP &amp; Profit pages:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#9a3412">${esc(code)}</p>
<p style="font-size:13px;color:#5c4d42">Valid for 10 minutes. If you did not ask for this code, someone tried to open the HPP page: tell your developer.</p>`),
  };
}

// ---------------------------------------------------------------------------
// Affiliates (jentiskitchen.id/affiliate)
// ---------------------------------------------------------------------------

/**
 * The affiliate's links: sent right after signing up ("welcome") and again when they ask on the sign-up page
 * ("reminder", the "Lihat link & komisi saya" box).
 */
export function affiliateLinksEmail(
  a: { name: string; email: string; code: string; slug: string; commissionPerBox: number },
  links: EmailLinks,
  kind: 'welcome' | 'reminder',
): Email {
  const share = `${links.shopUrl}/r/${a.code}`;
  const page = `${links.shopUrl}/affiliate/${a.slug}`;
  const first = a.name.split(/\s+/)[0];
  const intro =
    kind === 'welcome'
      ? `<p>Halo ${esc(first)}, terima kasih sudah bergabung jadi affiliate Jentis Kitchen! 🎉</p>
<p>Kamu dapat <b>${esc(formatRupiah(a.commissionPerBox))} untuk setiap box</b> yang dibeli teman yang belanja pertama kali lewat link kamu, juga setiap kali mereka pesan lagi. <b>SELAMANYA.</b> Komisi ditransfer setiap hari Minggu.</p>`
      : `<p>Halo ${esc(first)}, ini link affiliate kamu.</p>`;
  return {
    to: a.email,
    subject: kind === 'welcome' ? 'Link affiliate Jentis Kitchen kamu' : 'Link & komisi affiliate kamu',
    html: layout(
      kind === 'welcome' ? 'Selamat datang, affiliate Jentis Kitchen!' : 'Link & komisi affiliate kamu',
      `${intro}
<p style="margin:16px 0 4px;font-weight:bold">Link untuk dibagikan:</p>
<div style="border:2px dashed #9a3412;border-radius:10px;padding:12px;text-align:center;font-size:18px;font-weight:bold"><a href="${esc(share)}" style="color:#9a3412;text-decoration:none">${esc(share.replace(/^https?:\/\//, ''))}</a></div>
<p style="margin:20px 0 0">Cek komisi kamu, ambil foto produk untuk promosi, dan bagikan ke WhatsApp di halaman affiliate kamu:</p>
${button(page, 'Lihat link & komisi saya')}
<p style="font-size:12px;color:#8a7a6d">Simpan email ini supaya mudah membuka halaman kamu lagi.</p>`,
    ),
  };
}
