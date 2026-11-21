'use client';

import { shopAsset } from '@/lib/shop/catalog';

/**
 * "card": full-width stepper on product cards (48px buttons).
 * "compact": checkout rows (40px buttons, light background).
 * "mini": the short product rows on phones (32px buttons), so the price beside it stays on one line.
 */
export default function QtyStepper({
  value,
  max,
  onChange,
  label,
  variant = 'card',
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  variant?: 'card' | 'compact' | 'mini';
}) {
  const card = variant === 'card';
  const mini = variant === 'mini';
  const btn = `${card ? 'size-10 sm:size-12' : mini ? 'size-8' : 'size-10'} flex items-center justify-center rounded-xl hover:bg-[#f3f4f6] disabled:opacity-40`;
  return (
    <div
      className={`flex items-center border border-[#e5e7eb] ${mini ? 'rounded-xl p-[3px]' : 'rounded-2xl p-[5px]'} ${
        card ? 'justify-between w-full' : 'bg-[rgba(249,250,251,0.5)]'
      }`}
    >
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label={`Kurangi ${label}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {card ? <img src={shopAsset('/icons/minus.svg')} alt="" width={13} height={2} /> : <img src={shopAsset('/icons/minus-sm.svg')} alt="" width={14} height={16} />}
      </button>
      <span className={`font-bold tabular-nums text-[#111827] ${card ? 'text-lg sm:text-xl' : mini ? 'text-base px-2' : 'text-lg px-4'}`} aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`Tambah ${label}`}>
        {card ? (
          <span className="text-[#9ca3af] text-base leading-4 font-black">+</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shopAsset('/icons/plus-sm.svg')} alt="" width={14} height={16} />
        )}
      </button>
    </div>
  );
}
