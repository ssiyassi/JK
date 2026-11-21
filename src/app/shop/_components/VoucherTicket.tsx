import type { ReactNode } from 'react';
import { formatRupiah, shopAsset } from '@/lib/shop/catalog';

const dateId = (ms: number) =>
  new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });

export interface TicketVoucher {
  code: string;
  label: string;
  percent: number;
  fixedAmount: number | null;
  capAmount: number | null;
  minOrder: number;
  expiresAt: number | null;
}

/**
 * Voucher drawn as a cream ticket: name, amount and terms on the left; code and an action (Salin / Pakai / Lepas /
 * status) on the right. `showValidity` adds "Berlaku s/d …". The heading uses --font-heading (Playfair) when the page
 * provides it.
 */
export default function VoucherTicket({
  voucher: v,
  action,
  codeLabel = 'Kode voucher',
  codeLabelClass = 'text-[#6b7280]',
  showValidity = true,
}: {
  voucher: TicketVoucher;
  action: ReactNode;
  codeLabel?: string;
  codeLabelClass?: string;
  showValidity?: boolean;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[440px] min-h-[105px] grid grid-cols-2 bg-[length:100%_100%] bg-no-repeat"
      style={{ backgroundImage: `url(${shopAsset('/icons/voucher-ticket.png')})` }}
    >
      <div className="flex flex-col gap-1 py-3 pl-5 pr-3 min-w-0">
        <p className="font-[family-name:var(--font-heading)] font-bold text-[#111827] text-xs leading-5 break-words">{v.label}</p>
        {v.fixedAmount ? (
          <p className="text-[22px] leading-[35px] font-black text-[#9a3412] whitespace-nowrap">{formatRupiah(v.fixedAmount)}</p>
        ) : (
          <p className="text-[42px] leading-[35px] font-black text-[#9a3412]">{v.percent}%</p>
        )}
        {v.capAmount !== null && <p className="text-[10px] leading-4 text-[#6b7280]">(maks. {formatRupiah(v.capAmount)})</p>}
        {v.minOrder > 0 && <p className="text-[10px] leading-4 text-[#6b7280]">Min. belanja {formatRupiah(v.minOrder)}</p>}
        {showValidity && (
          <p className="text-[10px] leading-4 text-[#6b7280]">{v.expiresAt ? `Berlaku s/d ${dateId(v.expiresAt)}` : 'Tanpa batas waktu'}</p>
        )}
      </div>
      <div className="flex flex-col justify-center gap-1 py-3 pl-3 pr-5 min-w-0">
        <p className={`px-0.5 text-[10px] leading-[14px] font-bold tracking-[1px] uppercase ${codeLabelClass}`}>{codeLabel}</p>
        <p className="rounded-xl border border-[#f1c58e] px-1 py-2 text-center text-[11px] leading-4 font-bold tracking-tight text-[#111827] truncate">{v.code}</p>
        {action}
      </div>
    </div>
  );
}

/** Pill-shaped button style for the ticket's action slot. */
export const ticketButton =
  'flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] leading-[15px] font-bold disabled:opacity-60';
