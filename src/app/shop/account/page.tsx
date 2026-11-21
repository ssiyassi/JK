import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP, formatRupiah, shopAsset, VOUCHER_RULES, whatsappLink } from '@/lib/shop/catalog';
import { listCustomerOrders } from '@/lib/shop/orders';
import { currentCustomer, shopBase } from '@/lib/shop/server';
import { displayPhone } from '@/lib/shop/util';
import { listCustomerCampaignVouchers } from '@/lib/shop/campaigns';
import { listCustomerVouchers, loadVoucherRules } from '@/lib/shop/vouchers';
import CopyButton from '../_components/CopyButton';
import LogoutButton from '../_components/LogoutButton';
import VoucherTicket, { ticketButton } from '../_components/VoucherTicket';
import { playfair } from '../fonts';

export const dynamic = 'force-dynamic';

const heading = 'font-[family-name:var(--font-heading)] font-bold text-[#111827]';

// The wallpaper is a phone-sized picture: on wider screens keep it 640px wide, centred, with faded sides.
const wallpaperWide =
  'sm:left-1/2 sm:right-auto sm:w-[640px] sm:-translate-x-1/2 sm:[mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]';

const dateId =(ms: number) =>
  new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

type Pill = { label: string; cls: string; icon: string | null };

function orderStatus(o: { orderStatus: string; paymentStatus: string; deliveryStatus: string; proofUploadedAt: number | null; shippedAt: number | null }): Pill {
  if (o.orderStatus === 'CANCELLED') return { label: 'Dibatalkan', cls: 'bg-[#fef2f2] border-[#fee2e2] text-[#dc2626]', icon: 'x-circle-red' };
  if (o.deliveryStatus === 'DELIVERED') return { label: 'Diterima', cls: 'bg-[#f0fdf4] border-[#dcfce7] text-[#16a34a]', icon: 'check-green' };
  if (o.shippedAt) return { label: 'Dikirim', cls: 'bg-[#eff6ff] border-[#dbeafe] text-[#2563eb]', icon: null };
  if (o.paymentStatus === 'PAID') return { label: 'Disiapkan', cls: 'bg-[#fffbeb] border-[#fef3c7] text-[#b45309]', icon: null };
  if (o.proofUploadedAt) return { label: 'Pembayaran dicek', cls: 'bg-[#fffbeb] border-[#fef3c7] text-[#b45309]', icon: null };
  return { label: 'Menunggu pembayaran', cls: 'bg-[#fff7ed] border-[#ffedd5] text-[#9a3412]', icon: null };
}

function StatusPill({ pill }: { pill: Pill }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[10px] leading-[15px] font-bold whitespace-nowrap ${pill.cls}`}>
      {pill.icon ? (
        <img src={shopAsset(`/icons/${pill.icon}.svg`)} alt="" width={10} height={10} />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {pill.label}
    </span>
  );
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return <div className="size-10 shrink-0 rounded-2xl bg-[#fdf2f0] flex items-center justify-center">{children}</div>;
}

export default async function AccountPage(props: { searchParams: Promise<{ welcome?: string }> }) {
  const [search, base, customer] = await Promise.all([props.searchParams, shopBase(), currentCustomer()]);
  if (!customer) redirect(`${base}/login?next=${encodeURIComponent(`${base}/account`)}`);
  const db = getDB();
  const now = Date.now();
  const [ownVouchers, blastVouchers, orders, rules] = await Promise.all([
    listCustomerVouchers(db, customer.id, now),
    listCustomerCampaignVouchers(db, customer, now),
    listCustomerOrders(db, customer.id),
    loadVoucherRules(db),
  ]);
  // Admin email-blast vouchers first (newest), then the welcome / monthly / referral vouchers.
  const vouchers = [
    ...blastVouchers,
    ...ownVouchers.map((v) => ({ ...v, label: VOUCHER_RULES[v.kind].label, fixedAmount: null as number | null, minOrder: 0 })),
  ];
  const phone = displayPhone(customer.phone);

  return (
    <div className={`${playfair.variable} isolate max-w-xl mx-auto space-y-5 sm:pt-2`}>
      {/* Wallpaper: cream page, plate photo from the very top behind the header (scrolls away), spices pinned to the
          bottom of the screen. No positioned ancestor, so the top picture is placed against the whole page. */}
      <div aria-hidden className="max-sm:hidden pointer-events-none fixed inset-0 -z-10 bg-[#fdf6ee]" />
      <img
        src={shopAsset('/wallpaper/top.webp')}
        alt=""
        aria-hidden
        className={`max-sm:hidden pointer-events-none absolute top-0 inset-x-0 -z-10 w-full ${wallpaperWide}`}
      />
      <img
        src={shopAsset('/wallpaper/bottom.webp')}
        alt=""
        aria-hidden
        className={`max-sm:hidden pointer-events-none fixed bottom-0 inset-x-0 -z-10 w-full ${wallpaperWide}`}
      />

      {search.welcome && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4">
          <p className="font-semibold text-green-900">Selamat datang di Jentis Kitchen 🎉</p>
          <p className="text-sm text-green-800 mt-1">
            Voucher {rules.WELCOME.percent}% Anda ada di bawah dan juga dikirim ke {customer.email}.
          </p>
        </div>
      )}

      {customer.emailVerifiedAt === null && (
        <div className="rounded-2xl bg-[#fdf3ea] border border-[#f3d9c2] p-4">
          <p className="font-semibold text-[#7c2d12]">Konfirmasi email untuk mendapatkan voucher {rules.WELCOME.percent}%</p>
          <p className="text-sm text-[#5c4d42] mt-1">Masukkan kode 6 angka yang kami kirim ke {customer.email}.</p>
          <Link
            href={`${base}/verify-email`}
            className="mt-3 inline-block rounded-lg bg-[#9a3412] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7c2d12]"
          >
            Masukkan kode
          </Link>
        </div>
      )}

      {/* Phones: app-style account page (2026-11-12). Orders and vouchers have their own pages there. */}
      <div className="sm:hidden flex flex-col gap-5">
        <section className={phoneCard}>
          <div className="flex items-center gap-3">
            <span className="size-14 shrink-0 rounded-[18px] bg-[#fdf3ea] text-[22px] font-extrabold text-[#9a3412] grid place-items-center" aria-hidden>
              {customer.name.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-[#111827]">{customer.name}</h1>
              <p className="text-sm text-[#4b5563]">{phone}</p>
              <p className="truncate text-sm text-[#4b5563]">{customer.email}</p>
            </div>
          </div>
          <div className="mt-3.5 grid grid-cols-3 border-t border-[#f3eee8] pt-3 text-center">
            <Link href={`${base}/pesanan`}>
              <b className="block text-[17px] text-[#9a3412]">{orders.length}</b>
              <span className="text-[11px] text-[#4b5563]">Pesanan</span>
            </Link>
            <Link href={`${base}/voucher`} className="border-x border-[#f3eee8]">
              <b className="block text-[17px] text-[#9a3412]">{vouchers.filter((v) => v.status === 'AVAILABLE').length}</b>
              <span className="text-[11px] text-[#4b5563]">Voucher</span>
            </Link>
            <Link href={`${base}/voucher#ajak-teman`}>
              <b className="block text-[17px] text-[#9a3412]">{ownVouchers.filter((v) => v.kind === 'REFERRAL').length}</b>
              <span className="text-[11px] text-[#4b5563]">Teman diajak</span>
            </Link>
          </div>
        </section>

        <PhoneGroup title="Belanja">
          <PhoneRow href={`${base}/pesanan`} tone="bg-[#f1f5f9]" icon="🧾" title="Pesanan saya" text={orders.length ? `${orders.length} pesanan` : 'Belum ada pesanan'} />
          <PhoneRow href={`${base}/voucher`} tone="bg-[#fdf3ea]" icon="🎁" title="Voucher saya" text={`${vouchers.filter((v) => v.status === 'AVAILABLE').length} siap dipakai`} />
          <PhoneRow href={`${base}/voucher#ajak-teman`} tone="bg-[#eff6ff]" icon="👥" title={`Ajak teman, dapat ${rules.REFERRAL.percent}%`} text="Bagikan nomor HP kamu" />
        </PhoneGroup>

        <PhoneGroup title="Info & bantuan">
          <PhoneRow href={`${base}/resep-tips`} tone="bg-[#fdf2f8]" icon="🍳" title="Resep & tips" text="Ide masak dengan daging BBQ" />
          <PhoneRow href={whatsappLink(CONTACT_WHATSAPP, 'Halo Customer Care Jentis Kitchen, saya butuh bantuan.')} external tone="bg-[#dcfce7]" icon="💬" title="Chat Customer Care" text="0852-1544-8802" />
          <PhoneRow href={`${base || ''}/#faq`} tone="bg-[#f5f3ff]" icon="❓" title="Pertanyaan umum" text="Penyimpanan, cara masak, pengiriman" />
          <PhoneRow href={`${base}/kebijakan-privasi`} tone="bg-[#f1f5f9]" icon="🛡️" title="Kebijakan privasi" />
          <div className="px-3.5 py-3">
            <LogoutButton />
          </div>
        </PhoneGroup>
      </div>

      <div className="max-sm:hidden space-y-5">
      <div className="flex items-start justify-between gap-3 px-2">
        <div className="min-w-0 space-y-2">
          <h1 className="text-4xl leading-10 font-bold text-[#111827] break-words">{customer.name}</h1>
          <p className="flex items-center gap-2 text-sm font-medium text-[#4b5563]">
            <img src={shopAsset('/icons/mail.svg')} alt="" width={16} height={16} className="shrink-0" />
            <span className="truncate">{customer.email}</span>
          </p>
          <p className="flex items-center gap-2 text-sm font-medium text-[#4b5563]">
            <img src={shopAsset('/icons/phone.svg')} alt="" width={16} height={16} className="shrink-0 -scale-x-100" />
            {phone}
          </p>
        </div>
        <LogoutButton />
      </div>

      <section className="relative overflow-hidden rounded-xl border border-[#f3f4f6] bg-[#fcf8f3] px-4 py-[13px] shadow-sm space-y-2.5">
        <img src={shopAsset('/icons/leaf.svg')} alt="" width={36} height={36} className="absolute right-4 top-2 opacity-10" />
        <div className="flex items-center gap-3">
          <IconBadge>
            <img src={shopAsset('/icons/ticket-sm.svg')} alt="" width={18} height={16} className="-rotate-45" />
          </IconBadge>
          <h2 className={`${heading} text-xl leading-7`}>Voucher saya</h2>
        </div>
        {vouchers.length === 0 ? (
          <p className="text-sm text-[#6b7280] pb-1">Belum ada voucher.</p>
        ) : (
          <ul className="space-y-2.5">
            {vouchers.map((v) => (
              <li key={v.id}>
                <VoucherTicket
                  voucher={v}
                  showValidity={v.status === 'AVAILABLE'}
                  action={
                    v.status === 'AVAILABLE' ? (
                      <CopyButton
                        text={v.code}
                        icon={<img src={shopAsset('/icons/copy-white.svg')} alt="" width={10} height={10} />}
                        className={`${ticketButton} bg-[#9a3412] hover:bg-[#7c2d12] text-white`}
                      />
                    ) : (
                      <span className={`${ticketButton} !justify-start bg-[#e5e7eb]/50 text-[#6b7280]`}>
                        {v.status === 'USED' && <img src={shopAsset('/icons/check-grey.svg')} alt="" width={10} height={10} />}
                        {v.status === 'USED' ? 'Sudah dipakai' : 'Kedaluwarsa'}
                      </span>
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="relative overflow-hidden rounded-[40px] bg-[#2d1b14] p-5 space-y-3">
        <img
          src={shopAsset('/icons/gift-outline.svg')}
          alt=""
          width={120}
          height={120}
          className="absolute -right-8 top-1/2 -translate-y-1/2 rotate-[8deg] opacity-10"
        />
        <div className="relative flex items-center gap-4">
          <div className="h-9 w-[34px] shrink-0 rounded-[20px] bg-gradient-to-br from-[#9a3412] to-[#5c2006] shadow-lg flex items-center justify-center">
            <img src={shopAsset('/icons/gift.svg')} alt="" width={21} height={21} className="size-[18px]" />
          </div>
          <h2 className="font-[family-name:var(--font-heading)] font-bold text-[17px] leading-7 text-white">
            Ajak teman, dapat voucher {rules.REFERRAL.percent}%
          </h2>
        </div>
        <p className="relative text-xs leading-[22.75px] text-[#d1d5db]">
          Minta teman Anda memasukkan nomor HP Anda saat mendaftar. Setelah pesanan pertama mereka diterima, Anda mendapat voucher{' '}
          {rules.REFERRAL.percent}% (maks. {formatRupiah(rules.REFERRAL.cap)}).
        </p>
        <div className="relative flex items-center justify-between gap-3 rounded-xl border border-[#5f4638] bg-[#493125] px-5 py-[13px]">
          <div className="min-w-0">
            <p className="text-[10px] leading-[15px] font-bold tracking-[0.5px] uppercase text-[#9ca3af]">Nomor HP Anda</p>
            <p className="text-base leading-7 font-bold tracking-[0.5px] text-white truncate">{phone}</p>
          </div>
          <CopyButton
            text={phone}
            icon={<img src={shopAsset('/icons/copy-white.svg')} alt="" width={14} height={14} />}
            className="shrink-0 flex items-center gap-2 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] px-6 py-3 text-sm font-bold text-white"
          />
        </div>
      </section>

      <section className="rounded-xl border border-[#ebd7bf] bg-[#fbf8f3] p-5 shadow-sm space-y-2.5">
        <div className="flex items-center gap-1.5">
          <IconBadge>
            <img src={shopAsset('/icons/box.svg')} alt="" width={22} height={18} />
          </IconBadge>
          <h2 className={`${heading} text-xl leading-7`}>Pesanan saya</h2>
        </div>
        {orders.length === 0 ? (
          <p className="text-sm text-[#6b7280]">
            Belum ada pesanan.{' '}
            <Link href={base || '/'} className="text-[#9a3412] font-medium">
              Mulai belanja
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-[#faead7]">
            {orders.map((o) => {
              const items = o.lines.reduce((n, l) => n + l.qty, 0);
              return (
                <li key={o.orderRowId}>
                  <Link href={`${base}/orders/${o.orderRowId}`} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0 space-y-[5px]">
                      <p className="text-[15px] leading-[22.5px] font-bold text-[#111827]">#{o.orderId}</p>
                      <p className="text-xs leading-4 font-medium text-[#9ca3af]">
                        {formatRupiah(o.total)} • {items} Item
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="pt-0.5 text-xs leading-4 font-medium text-[#9ca3af] whitespace-nowrap">{dateId(o.createdAt)}</p>
                      <StatusPill pill={orderStatus(o)} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

const phoneCard = 'rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]';

function PhoneGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-bold uppercase tracking-[0.5px] text-[#9ca3af]">{title}</h2>
      <div className="divide-y divide-[#f3eee8] overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">{children}</div>
    </section>
  );
}

function PhoneRow({ href, icon, tone, title, text, external }: { href: string; icon: string; tone: string; title: string; text?: string; external?: boolean }) {
  const inner = (
    <>
      <span className={`size-9 shrink-0 rounded-xl grid place-items-center text-base ${tone}`} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm font-semibold text-[#111827]">{title}</b>
        {text && <span className="block truncate text-xs text-[#4b5563]">{text}</span>}
      </span>
      <span className="text-lg text-[#cbbfb3]" aria-hidden>
        ›
      </span>
    </>
  );
  const cls = 'flex items-center gap-3 px-3.5 py-3';
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}
