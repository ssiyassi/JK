import type { Metadata } from 'next';
import Link from 'next/link';
import { getDB } from '@/lib/server';
import { formatRupiah, shopAsset, VOUCHER_RULES } from '@/lib/shop/catalog';
import { currentCustomer, shopBase } from '@/lib/shop/server';
import { displayPhone } from '@/lib/shop/util';
import { listCustomerCampaignVouchers } from '@/lib/shop/campaigns';
import { listCustomerVouchers, loadVoucherRules } from '@/lib/shop/vouchers';
import CopyButton from '../_components/CopyButton';
import VoucherTicket, { ticketButton } from '../_components/VoucherTicket';
import { playfair } from '../fonts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Voucher saya', robots: { index: false } };

const card = 'rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]';
const heading = 'font-[family-name:var(--font-heading)] font-extrabold text-[#3b1a0c]';

/**
 * "Voucher saya" (app layout, 2026-11-12): the customer's vouchers, then "Ajak teman" laid out as the whole loop on one
 * card (what the friend gets, what you get, 3 steps, your number, one WhatsApp button). Guests see the first-order
 * discount and how to get the monthly voucher.
 */
export default async function VoucherPage() {
  const [base, customer] = await Promise.all([shopBase(), currentCustomer()]);
  const db = getDB();
  const now = Date.now();
  const rules = await loadVoucherRules(db);
  const link = (path: string) => `${base}${path}`;

  const [ownVouchers, blastVouchers] = customer
    ? await Promise.all([listCustomerVouchers(db, customer.id, now), listCustomerCampaignVouchers(db, customer, now)])
    : [[], []];
  const vouchers = [
    ...blastVouchers,
    ...ownVouchers.map((v) => ({ ...v, label: VOUCHER_RULES[v.kind].label, fixedAmount: null as number | null, minOrder: 0 })),
  ];
  const available = vouchers.filter((v) => v.status === 'AVAILABLE');
  const friendsRewarded = ownVouchers.filter((v) => v.kind === 'REFERRAL').length;
  const phone = customer ? displayPhone(customer.phone) : null;
  const shareText = phone
    ? `Coba daging BBQ marinasi Jentis Kitchen, enak banget! Pesanan pertama diskon ${rules.WELCOME.percent}%. Daftar di ${'https://jentiskitchen.id'}/register dan isi nomor HP saya ${phone} ya.`
    : '';

  return (
    <div className={`${playfair.variable} max-w-xl mx-auto flex flex-col gap-5`}>
      <h1 className={`${heading} max-sm:sr-only text-[26px]`}>Voucher saya</h1>

      {customer ? (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-end justify-between">
            <h2 className={`${heading} text-[19px]`}>Siap dipakai</h2>
            <span className="text-[12.5px] text-[#4b5563]">{available.length} voucher</span>
          </div>
          {vouchers.length === 0 ? (
            <p className={`${card} text-sm text-[#6b7280]`}>Belum ada voucher.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
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
                        <span className={`${ticketButton} !justify-start bg-[#e5e7eb]/50 text-[#6b7280]`}>{v.status === 'USED' ? 'Sudah dipakai' : 'Kedaluwarsa'}</span>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          <Link href={link('/checkout')} className="self-start text-sm font-bold text-[#9a3412]">
            Pakai di checkout →
          </Link>
        </section>
      ) : (
        <section className={`${card} flex flex-col gap-3`}>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-gradient-to-br from-[#22a052] to-[#166534] px-3 py-2 text-xl font-extrabold text-white">{rules.WELCOME.percent}%</span>
            <div className="text-sm">
              <b className="block text-[#111827]">Diskon pesanan pertama</b>
              <span className="text-[#4b5563]">Otomatis di checkout, tanpa perlu daftar. Maks. {formatRupiah(rules.WELCOME.cap)}, khusus produk.</span>
            </div>
          </div>
          <p className="text-sm text-[#4b5563]">
            Punya akun? Dapat voucher {rules.MONTHLY.percent}% setiap bulan.{' '}
            <Link href={link(`/login?next=${encodeURIComponent(link('/voucher'))}`)} className="font-bold text-[#9a3412]">
              Masuk
            </Link>{' '}
            atau{' '}
            <Link href={link('/register')} className="font-bold text-[#9a3412]">
              daftar
            </Link>
            .
          </p>
        </section>
      )}

      <section id="ajak-teman" className={`${card} scroll-mt-20`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.5px] text-[#1d4ed8]">AJAK TEMAN</p>
            <h2 className={`${heading} mt-0.5 text-xl`}>Sama-sama untung</h2>
          </div>
          <span className="size-[52px] shrink-0 rounded-2xl bg-[#eff6ff] text-[#1d4ed8] grid place-items-center" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
            </svg>
          </span>
        </div>
        <div className="mt-3.5 grid grid-cols-[1fr_24px_1fr] items-center">
          <div className="rounded-2xl bg-[#ecfdf3] p-3 text-center text-[#15803d]">
            <p className="text-[11px] font-bold uppercase tracking-[0.4px]">Teman kamu</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none tracking-[-1px]">{rules.WELCOME.percent}%</p>
            <p className="mt-1 text-[11px] leading-tight text-[#4b5563]">diskon pesanan pertama</p>
          </div>
          <span className="text-center text-lg font-extrabold text-[#9ca3af]">+</span>
          <div className="rounded-2xl bg-[#fdf3ea] p-3 text-center text-[#9a3412]">
            <p className="text-[11px] font-bold uppercase tracking-[0.4px]">Kamu</p>
            <p className="mt-1 text-[26px] font-extrabold leading-none tracking-[-1px]">{rules.REFERRAL.percent}%</p>
            <p className="mt-1 text-[11px] leading-tight text-[#4b5563]">voucher untuk tiap teman (maks. {formatRupiah(rules.REFERRAL.cap)})</p>
          </div>
        </div>
        <ol className="mt-3.5 grid grid-cols-3 gap-1.5 text-center text-[11px] leading-tight text-[#4b5563]">
          {['Bagikan nomor HP kamu', 'Teman daftar & isi nomormu', 'Pesanan pertama teman diterima → voucher masuk'].map((t, i) => (
            <li key={t}>
              <span className="mx-auto mb-1 grid size-[26px] place-items-center rounded-full bg-[#3b1a0c] text-xs font-extrabold text-white">{i + 1}</span>
              {t}
            </li>
          ))}
        </ol>
        {phone ? (
          <>
            <div className="mt-3 flex items-center justify-between rounded-[14px] border-[1.5px] border-dashed border-[#e3cdb8] px-3 py-2.5">
              <div>
                <p className="text-[11px] text-[#6b7280]">Nomor HP kamu</p>
                <b className="tracking-[0.5px] text-[#111827]">{phone}</b>
              </div>
              <CopyButton text={phone} className="rounded-[11px] bg-[#fdf3ea] px-3 py-2 text-[13px] font-bold text-[#9a3412]" />
            </div>
            <div className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-[#faf9f6] px-3 py-2.5 text-sm">
              <b className="text-[#111827]">{friendsRewarded} teman berhasil</b>
              <span className="text-xs text-[#6b7280]">· {friendsRewarded} voucher {rules.REFERRAL.percent}% sudah kamu dapat</span>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-[#16a34a] text-[15px] font-bold text-white"
            >
              Ajak lewat WhatsApp
            </a>
          </>
        ) : (
          <Link
            href={link(`/login?next=${encodeURIComponent(link('/voucher#ajak-teman'))}`)}
            className="mt-3 flex h-12 items-center justify-center rounded-[14px] bg-[#9a3412] text-[15px] font-bold text-white"
          >
            Masuk untuk mengajak teman
          </Link>
        )}
      </section>

      <Link href={link('/affiliate')} className={`${card} flex items-center gap-3`}>
        <span className="size-10 shrink-0 rounded-xl bg-[#fef9c3] text-[#a16207] grid place-items-center text-lg font-extrabold" aria-hidden>
          Rp
        </span>
        <span className="flex-1 text-sm">
          <b className="block text-[#111827]">Mau dapat uang, bukan voucher?</b>
          <span className="text-[#4b5563]">Ikut Affiliate: Rp10.000/box SELAMANYA</span>
        </span>
        <span className="text-[#cbbfb3]" aria-hidden>
          ›
        </span>
      </Link>
    </div>
  );
}
