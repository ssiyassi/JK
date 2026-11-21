import type { Metadata } from 'next';
import Link from 'next/link';
import { getDB } from '@/lib/server';
import { formatDeliveryDate, formatRupiah } from '@/lib/shop/catalog';
import { listCustomerOrders, type ShopOrder } from '@/lib/shop/orders';
import { loadCatalog } from '@/lib/shop/products';
import { currentCustomer, guestOrdersInBrowser, shopBase } from '@/lib/shop/server';
import GuestOrderList from './GuestOrderList';
import { playfair } from '../fonts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Pesanan saya', robots: { index: false } };

type Status = { text: string; cls: string; open: boolean; step: number };

/** The same status words as the account page and the order page. */
function status(o: ShopOrder): Status {
  if (o.orderStatus === 'CANCELLED') return { text: 'Dibatalkan', cls: 'bg-[#fef2f2] text-[#dc2626]', open: false, step: -1 };
  if (o.deliveryStatus === 'DELIVERED') return { text: '✓ Sampai di Tujuan', cls: 'bg-[#f3f4f6] text-[#4b5563]', open: false, step: 4 };
  if (o.shippedAt) return { text: '🚚 Dalam Perjalanan', cls: 'bg-[#ecfdf3] text-[#15803d]', open: true, step: 2 };
  if (o.paymentStatus === 'PAID') return { text: 'Diproses', cls: 'bg-[#fffbeb] text-[#b45309]', open: true, step: 1 };
  if (o.proofUploadedAt) return { text: 'Pembayaran dicek', cls: 'bg-[#fffbeb] text-[#b45309]', open: true, step: 0 };
  return { text: '⏳ Menunggu pembayaran', cls: 'bg-[#fff7ed] text-[#c2410c]', open: true, step: 0 };
}

const card = 'rounded-[20px] bg-white p-3.5 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]';

/** Bottom-menu "Pesanan" page (app layout, 2026-11-12): orders still on their way first, finished ones under them. */
export default async function OrdersPage(props: { searchParams: Promise<{ tab?: string }> }) {
  const [search, base, customer] = await Promise.all([props.searchParams, shopBase(), currentCustomer()]);
  const db = getDB();
  const done = search.tab === 'selesai';
  const link = (path: string) => `${base}${path}`;

  const guestOrders = customer ? [] : await guestOrdersInBrowser();
  if (!customer && guestOrders.length === 0) {
    return (
      <div className={`${playfair.variable} max-w-xl mx-auto flex flex-col gap-4`}>
        <h1 className="max-sm:sr-only font-[family-name:var(--font-heading)] text-[26px] font-extrabold text-[#3b1a0c]">Pesanan saya</h1>
        <GuestOrderList />
        <div className={`${card} text-sm text-[#4b5563]`}>
          <p>
            Punya akun?{' '}
            <Link href={link(`/login?next=${encodeURIComponent(link('/pesanan'))}`)} className="font-bold text-[#9a3412]">
              Masuk
            </Link>{' '}
            untuk melihat semua pesanan Anda di semua perangkat.
          </p>
        </div>
      </div>
    );
  }

  const [orders, catalog] = await Promise.all([customer ? listCustomerOrders(db, customer.id) : Promise.resolve(guestOrders), loadCatalog(db)]);
  const photo = (product: string) => catalog.find((c) => c.product === product)?.image ?? null;
  const withStatus = orders.map((o) => ({ o, s: status(o) }));
  const open = withStatus.filter((x) => x.s.open);
  const closed = withStatus.filter((x) => !x.s.open);
  const shown = done ? closed : open;

  return (
    <div className={`${playfair.variable} max-w-xl mx-auto flex flex-col gap-4`}>
      <h1 className="max-sm:sr-only font-[family-name:var(--font-heading)] text-[26px] font-extrabold text-[#3b1a0c]">Pesanan saya</h1>
      <nav className="grid grid-cols-2 rounded-[14px] bg-[#efe8e1] p-1" aria-label="Pilih daftar pesanan">
        <Link href={link('/pesanan')} aria-current={!done ? 'page' : undefined} className={`rounded-[11px] py-2.5 text-center text-sm font-bold ${!done ? 'bg-white text-[#9a3412] shadow-sm' : 'text-[#4b5563]'}`}>
          Berjalan · {open.length}
        </Link>
        <Link href={link('/pesanan?tab=selesai')} aria-current={done ? 'page' : undefined} className={`rounded-[11px] py-2.5 text-center text-sm font-bold ${done ? 'bg-white text-[#9a3412] shadow-sm' : 'text-[#4b5563]'}`}>
          Selesai
        </Link>
      </nav>

      {shown.length === 0 ? (
        <div className={`${card} text-center text-sm text-[#4b5563] py-8`}>
          <p>{done ? 'Belum ada pesanan yang selesai.' : 'Tidak ada pesanan yang sedang berjalan.'}</p>
          <Link href={base || '/'} className="mt-3 inline-block rounded-[14px] bg-[#9a3412] px-5 py-2.5 font-bold text-white">
            Mulai belanja
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map(({ o, s }) => {
            const boxes = o.lines.reduce((n, l) => n + l.qty, 0);
            const first = o.lines[0];
            return (
              <li key={o.orderRowId} className={card}>
                <Link href={link(`/orders/${o.orderRowId}`)} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${s.cls}`}>{s.text}</span>
                    <span className="text-[11px] text-[#6b7280] tabular-nums">#{o.orderId}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {o.lines.slice(0, 3).map((l, i) => {
                      const img = photo(l.product);
                      // eslint-disable-next-line @next/next/no-img-element
                      return img ? <img key={`${l.product}-${i}`} src={img} alt="" className="size-[46px] rounded-[10px] object-cover" /> : null;
                    })}
                    <div className="min-w-0 flex-1 text-sm">
                      <b className="block truncate text-[#111827]">{o.lines.length === 1 && first ? `${first.name} × ${first.qty}` : `${boxes} box`}</b>
                      <span className="text-xs text-[#6b7280]">
                        {s.step === 4 && o.deliveredAt
                          ? `Diterima ${new Date(o.deliveredAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short' })}`
                          : o.deliveryDate !== null && s.open
                            ? `Dikirim ${formatDeliveryDate(o.deliveryDate)}`
                            : new Date(o.createdAt).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                  {s.open && s.step >= 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-1" aria-hidden>
                      {[0, 1, 2, 3].map((i) => (
                        <span
                          key={i}
                          className="h-[5px] rounded-full"
                          style={{ background: i < s.step ? '#22a052' : i === s.step ? 'linear-gradient(90deg,#22a052 50%,#efe8e1 50%)' : '#efe8e1' }}
                        />
                      ))}
                    </div>
                  )}
                  {s.step === 0 && o.paymentStatus === 'PENDING' && !o.proofUploadedAt && (
                    <p className="mt-3 rounded-[12px] bg-[#fff7ed] px-3 py-2 text-xs text-[#111827]">Selesaikan pembayaran supaya pesanan tidak batal otomatis.</p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-[#f3eee8] pt-3">
                    <span>
                      <span className="block text-[11px] text-[#6b7280]">Total</span>
                      <b className="text-[15px] text-[#111827]">{formatRupiah(o.total)}</b>
                    </span>
                    <span
                      className={`rounded-[11px] px-4 py-2 text-[13px] font-bold ${
                        s.step === 0 && o.paymentStatus === 'PENDING' && !o.proofUploadedAt
                          ? 'bg-[#9a3412] text-white'
                          : 'border-[1.5px] border-[#9a3412] text-[#9a3412]'
                      }`}
                    >
                      {s.step === 0 && o.paymentStatus === 'PENDING' && !o.proofUploadedAt ? 'Bayar sekarang' : s.open ? 'Lacak' : 'Lihat'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {!customer && (
        <p className={`${card} text-sm text-[#4b5563]`}>
          Pesanan di atas dibuat di browser ini. Punya akun?{' '}
          <Link href={link(`/login?next=${encodeURIComponent(link('/pesanan'))}`)} className="font-bold text-[#9a3412]">
            Masuk
          </Link>{' '}
          untuk melihat semua pesanan Anda.
        </p>
      )}
    </div>
  );
}
