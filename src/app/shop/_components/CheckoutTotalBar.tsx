'use client';

import { useEffect, useState, type RefObject } from 'react';
import { formatRupiah } from '@/lib/shop/catalog';

// About the bar's height: it leaves as soon as the price breakdown would come out from behind it.
const BAR_HEIGHT_PX = 96;

/**
 * Floating footer on the checkout page (phones and tablets): the total after discounts and a pay button, until the
 * customer reaches the price breakdown (or while a text field is in use, when it would cover the field). The button
 * submits the checkout form, so the browser jumps to any required field that is still empty.
 */
export default function CheckoutTotalBar({
  total,
  saving,
  label,
  busy,
  breakdownRef,
  note,
}: {
  total: number;
  saving: number;
  label: string;
  busy: boolean;
  breakdownRef: RefObject<HTMLElement | null>;
  /** Replaces the line under the total (admin mode). */
  note?: string;
}) {
  const [reachedBreakdown, setReachedBreakdown] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const breakdown = breakdownRef.current;
    if (!breakdown) return;
    // Still "reached" after scrolling past it; the bar comes back only above it. The page's height also changes the
    // answer (the pin map opening, products removed).
    const check = () => setReachedBreakdown(breakdown.getBoundingClientRect().top < window.innerHeight - BAR_HEIGHT_PX);
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    const heightWatcher = new ResizeObserver(check);
    heightWatcher.observe(document.body);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      heightWatcher.disconnect();
    };
  }, [breakdownRef]);

  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => setTyping(e.target instanceof Element && e.target.matches('input, textarea, select'));
    const onFocusOut = () => setTyping(false);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const hidden = reachedBreakdown || typing;
  return (
    // Above the pin map (its layers go up to 1000), below the pop-ups (2000).
    <div
      className={`lg:hidden fixed bottom-0 inset-x-0 z-[1100] bg-[#faf9f6] sm:bg-white border-t border-[#f3e3d3] shadow-[0px_-6px_16px_-6px_rgba(154,52,18,0.22)] px-4 sm:px-8 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 transition-[transform,visibility] duration-200 ${
        hidden ? 'translate-y-full invisible' : ''
      }`}
    >
      {/* Phones (app layout): one full-width button with the total, savings under it. */}
      <div className="sm:hidden w-full">
        <button
          type="submit"
          disabled={busy}
          className="w-full h-[50px] rounded-[14px] bg-[#9a3412] text-white text-base font-bold shadow-[0_6px_16px_rgba(154,52,18,0.28)] disabled:opacity-60"
        >
          {busy ? 'Memproses…' : `${label} · ${formatRupiah(total)}`}
        </button>
        <p className="mt-1.5 text-center text-[11.5px] text-[#4b5563]">
          {saving > 0 && <b className="text-[#15803d]">Hemat {formatRupiah(saving)} · </b>}
          {note ?? (label === 'Bayar' ? 'Pilih cara bayar di langkah berikutnya' : 'Transfer bank setelah pesanan dibuat')}
        </p>
      </div>
      <div className="hidden sm:block min-w-0">
        <p className="text-xs leading-4 text-[#6b7280]">
          Total{saving > 0 && <span className="ml-1 line-through">{formatRupiah(total + saving)}</span>}
        </p>
        <p className="text-[22px] leading-7 font-bold text-[#111827] whitespace-nowrap">{formatRupiah(total)}</p>
        {saving > 0 && (
          <span className="inline-block mt-0.5 rounded-full bg-[#dcfce7] px-2 py-px text-xs font-bold text-[#166534] whitespace-nowrap">Hemat {formatRupiah(saving)}</span>
        )}
      </div>
      <button
        type="submit"
        disabled={busy}
        className="hidden sm:block shrink-0 px-6 py-3.5 rounded-2xl bg-[#9a3412] hover:bg-[#7c2d12] text-white text-lg font-bold whitespace-nowrap disabled:opacity-60"
      >
        {busy ? 'Memproses…' : label}
      </button>
    </div>
  );
}
