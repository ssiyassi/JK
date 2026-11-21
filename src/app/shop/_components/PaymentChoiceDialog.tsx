'use client';

import { useState } from 'react';
import { formatRupiah, PAYMENT_INSTRUCTIONS, shopAsset } from '@/lib/shop/catalog';

export type WalletChoice = 'OVO' | 'SHOPEEPAY' | 'DANA';
export type PaymentChoice = 'QRIS' | WalletChoice | 'TRANSFER';

/** E-wallets in the order they are listed: logo (phone sheet), short text (phone), longer text (computer). */
const WALLETS: { key: WalletChoice; title: string; logo: React.ReactNode; text: string; longText: string }[] = [
  {
    key: 'OVO',
    title: 'OVO',
    logo: <span className="text-sm font-black tracking-wide text-[#4c2a86]">OVO</span>,
    text: 'Setujui di aplikasi OVO dalam 60 detik',
    longText: 'Masukkan nomor HP OVO Anda, lalu setujui di aplikasi OVO dalam 60 detik. Jika tidak dibayar dalam 3 menit, pesanan otomatis dibatalkan.',
  },
  {
    key: 'SHOPEEPAY',
    title: 'ShopeePay',
    // eslint-disable-next-line @next/next/no-img-element
    logo: <img src={shopAsset('/icons/shopeepay.png')} alt="ShopeePay" width={46} height={46} className="size-full object-cover" />,
    text: 'Bayar menggunakan Aplikasi Shopee',
    longText: 'Bayar menggunakan Aplikasi Shopee.',
  },
  {
    key: 'DANA',
    title: 'DANA',
    // eslint-disable-next-line @next/next/no-img-element
    logo: <img src={shopAsset('/icons/dana.png')} alt="DANA" width={34} height={34} className="size-[34px]" />,
    text: 'Bayar menggunakan Aplikasi DANA',
    longText: 'Bayar menggunakan Aplikasi DANA.',
  },
];

/**
 * Pop-up after "Bayar": QRIS (default, DOKU's payment page), OVO, ShopeePay or DANA (when set up) or manual BCA
 * transfer (the order page then shows the account and asks for the transfer proof). The order is only created once the customer picks one.
 */
export default function PaymentChoiceDialog({
  total,
  wallets,
  busy,
  onChoose,
  onClose,
  initial = 'QRIS',
  busyText = 'Membuat pesanan…',
}: {
  total: number | null;
  /** The e-wallets that are set up (OVO/ShopeePay: Duitku, DANA: DOKU). */
  wallets: readonly WalletChoice[];
  busy: PaymentChoice | null;
  onChoose: (choice: PaymentChoice) => void;
  onClose: () => void;
  /** Pre-selected on phones: QRIS at checkout, the order's current method on the order page. */
  initial?: PaymentChoice;
  /** Shown on the button while working: the order is created at checkout; the payment page opens on the order page. */
  busyText?: string;
}) {
  // Phones: pick a method first, then confirm with one big button (app-style bottom sheet, 2026-11-12).
  const [picked, setPicked] = useState<PaymentChoice>(initial);
  const options: { key: PaymentChoice; logo: React.ReactNode; title: string; text: string; badge?: string }[] = [
    {
      key: 'QRIS',
      // eslint-disable-next-line @next/next/no-img-element
      logo: <img src={shopAsset('/icons/qris.png')} alt="QRIS" width={38} height={15} className="h-auto w-[38px]" />,
      title: 'QRIS',
      text: 'Semua e-wallet & m-banking · langsung terkonfirmasi',
      badge: 'Paling cepat',
    },
    ...WALLETS.filter((w) => wallets.includes(w.key)),
    {
      key: 'TRANSFER',
      logo: <span className="text-sm font-black text-[#0060af]">{PAYMENT_INSTRUCTIONS.bank}</span>,
      title: `Transfer manual ${PAYMENT_INSTRUCTIONS.bank}`,
      text: 'Wajib unggah bukti transfer dalam 24 jam',
    },
  ];
  const sheet = (
    <div className="sm:hidden w-full max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-[#faf9f6] px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="mx-auto mb-2 h-[5px] w-10 rounded-full bg-[#dccfc3]" aria-hidden />
      <div className="flex items-center justify-between">
        <h2 id="payment-choice-title" className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-[#3b1a0c]">
          Pilih cara bayar
        </h2>
        <button type="button" disabled={busy !== null} onClick={onClose} aria-label="Tutup" className="size-9 grid place-items-center text-xl text-[#9ca3af]">
          ✕
        </button>
      </div>
      <div className="mt-2 flex flex-col gap-2.5" role="radiogroup" aria-labelledby="payment-choice-title">
        {options.map((o) => {
          const on = picked === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy !== null}
              onClick={() => setPicked(o.key)}
              className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-3 text-left ${on ? 'border-[#9a3412] bg-[#fdf3ea]' : 'border-[#eee7df] bg-white'}`}
            >
              <span className="size-[46px] shrink-0 overflow-hidden rounded-xl border border-[#eee7df] bg-white grid place-items-center">{o.logo}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#111827]">
                  {o.title}
                  {o.badge && <span className="rounded-full border border-[#bbf7d0] bg-[#ecfdf3] px-2 py-px text-[10.5px] font-bold text-[#15803d]">{o.badge}</span>}
                </span>
                <span className="block text-xs text-[#4b5563]">{o.text}</span>
              </span>
              <span className={`size-[22px] shrink-0 rounded-full bg-white ${on ? 'border-[7px] border-[#9a3412]' : 'border-2 border-[#bfb2a6]'}`} aria-hidden />
            </button>
          );
        })}
      </div>
      {picked === 'TRANSFER' && (
        <p className="mt-2 text-xs font-semibold text-[#9a3412]">Setelah transfer, Anda wajib mengunggah bukti transfer (foto/screenshot atau PDF) dalam 24 jam. Pesanan diproses setelah pembayaran kami cek.</p>
      )}
      {total !== null && (
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-[#e8ddd2] pt-3">
          <span className="text-[#4b5563]">Total bayar</span>
          <b className="text-xl text-[#9a3412]">{formatRupiah(total)}</b>
        </div>
      )}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => onChoose(picked)}
        className="mt-3 w-full h-[52px] rounded-[14px] bg-[#9a3412] text-white text-base font-bold shadow-[0_6px_16px_rgba(154,52,18,0.28)] disabled:opacity-60"
      >
        {busy ? busyText : `Bayar dengan ${options.find((o) => o.key === picked)?.title ?? ''}${total !== null ? ` · ${formatRupiah(total)}` : ''}`}
      </button>
      <p className="mt-2 text-center text-[11.5px] text-[#6b7280]">🔒 Pembayaran aman</p>
    </div>
  );
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-choice-title"
      onClick={() => !busy && onClose()}
    >
      {sheet}
      <div className="hidden sm:block w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-[#111827]">
          Pilih cara pembayaran
        </h2>
        {total !== null && <p className="mt-1 text-base text-[#6b7280]">Total {formatRupiah(total)}</p>}

        <div className="mt-5 flex flex-col gap-3">
          <button
            type="button"
            autoFocus
            disabled={busy !== null}
            onClick={() => onChoose('QRIS')}
            className="relative w-full text-left rounded-2xl border-2 border-[#9a3412] bg-[#fff7ed] p-4 hover:bg-[#ffedd5] disabled:opacity-60"
          >
            <span className="absolute top-3 right-3 rounded-full bg-[#9a3412] px-2.5 py-0.5 text-xs font-bold text-white">Disarankan</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shopAsset('/icons/qris.png')} alt="QRIS" width={124} height={48} className="h-12 w-auto" />
            <p className="mt-3 text-lg font-bold text-[#111827]">{busy === 'QRIS' ? busyText : 'Bayar dengan QRIS'}</p>
            <p className="mt-1 text-sm text-[#4b5563]">
              Scan dengan aplikasi e-wallet atau m-banking apa saja (GoPay, OVO, DANA, ShopeePay, BCA, dll). Pembayaran langsung terkonfirmasi.
            </p>
          </button>

          {WALLETS.filter((w) => wallets.includes(w.key)).map((w) => (
            <button
              key={w.key}
              type="button"
              disabled={busy !== null}
              onClick={() => onChoose(w.key)}
              className="w-full flex items-start gap-3 text-left rounded-2xl border border-[#e5e7eb] bg-white p-4 hover:bg-[#f9fafb] disabled:opacity-60"
            >
              <span className="size-12 shrink-0 overflow-hidden rounded-xl border border-[#eee7df] bg-white grid place-items-center">{w.logo}</span>
              <span className="min-w-0">
                <span className="block text-lg font-bold text-[#111827]">{busy === w.key ? busyText : `Bayar dengan ${w.title}`}</span>
                <span className="mt-1 block text-sm text-[#4b5563]">{w.longText}</span>
              </span>
            </button>
          ))}

          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onChoose('TRANSFER')}
            className="w-full text-left rounded-2xl border border-[#e5e7eb] bg-white p-4 hover:bg-[#f9fafb] disabled:opacity-60"
          >
            <p className="text-lg font-bold text-[#111827]">
              {busy === 'TRANSFER' ? busyText : `Transfer manual ke ${PAYMENT_INSTRUCTIONS.bank}`}
            </p>
            <p className="mt-1 text-sm text-[#4b5563]">
              <span className="font-semibold text-[#9a3412]">
                Setelah transfer, Anda wajib mengunggah bukti transfer (foto/screenshot atau PDF) dalam 24 jam.
              </span>{' '}
              Pesanan diproses setelah pembayaran kami cek.
            </p>
          </button>
        </div>

        <button
          type="button"
          disabled={busy !== null}
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-2xl text-base font-semibold text-[#6b7280] hover:text-[#111827] disabled:opacity-60"
        >
          Kembali
        </button>
      </div>
    </div>
  );
}
