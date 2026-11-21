'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const parts = (key: string) => key.split('-').map(Number) as [number, number, number];
const monthOf = (key: string) => key.slice(0, 7); // YYYY-MM
const keyOf = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Delivery day picker: a button with the chosen day that opens a calendar. Only the offered days (`options`, YYYY-MM-DD,
 * earliest first, no Sundays) can be tapped; every other day is greyed out. The owner's days off (`fullDays`) say "Penuh".
 */
export default function DeliveryDatePicker({
  value,
  options,
  fullDays = [],
  onChange,
  formatLabel,
  chip,
}: {
  value: string;
  options: string[];
  fullDays?: string[];
  onChange: (key: string) => void;
  formatLabel: (key: string) => string;
  /** Phones: the calendar opens from a small date chip ("Lainnya"); `active` = the chosen day is not one of the chips. */
  chip?: { active: boolean };
}) {
  const [open, setOpen] = useState(false);
  const months = [...new Set(options.map(monthOf))];
  const [month, setMonth] = useState(monthOf(value));
  const shownMonth = months.includes(month) ? month : months[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  const [year, monthNumber] = parts(`${shownMonth}-01`);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leadingBlanks = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7; // weeks start on Monday
  const monthIndex = months.indexOf(shownMonth);

  const calendar = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pilih tanggal pengiriman"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[#111827]">Pilih tanggal pengiriman</h3>
          <button type="button" onClick={() => setOpen(false)} className="p-2 -m-2 text-[#6b7280] hover:text-[#111827]" aria-label="Tutup">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-[#8a7a6d] mb-4">Tidak ada pengiriman di hari Minggu.</p>

        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setMonth(months[monthIndex - 1])}
            disabled={monthIndex <= 0}
            className="p-2 rounded-lg text-[#9a3412] hover:bg-[#fdf3ea] disabled:opacity-25 disabled:hover:bg-transparent"
            aria-label="Bulan sebelumnya"
          >
            ‹
          </button>
          <span className="font-bold text-[#111827]">
            {MONTHS[monthNumber - 1]} {year}
          </span>
          <button
            type="button"
            onClick={() => setMonth(months[monthIndex + 1])}
            disabled={monthIndex >= months.length - 1}
            className="p-2 rounded-lg text-[#9a3412] hover:bg-[#fdf3ea] disabled:opacity-25 disabled:hover:bg-transparent"
            aria-label="Bulan berikutnya"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <span key={d} className={`text-xs font-semibold py-1 ${d === 'Min' ? 'text-[#d1a9a0]' : 'text-[#6b7280]'}`}>
              {d}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const key = keyOf(year, monthNumber, i + 1);
            const allowed = options.includes(key);
            const full = !allowed && fullDays.includes(key);
            const selected = key === value;
            return (
              <button
                key={key}
                type="button"
                disabled={!allowed}
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                aria-label={full ? `${formatLabel(key)} (penuh)` : formatLabel(key)}
                aria-pressed={selected}
                className={`relative aspect-square rounded-full text-sm font-semibold transition-colors ${
                  selected
                    ? 'bg-[#9a3412] text-white'
                    : allowed
                      ? 'text-[#111827] hover:bg-[#fdf3ea]'
                      : 'text-[#d1d5db] cursor-not-allowed'
                }`}
              >
                {i + 1}
                {full && <span className="absolute bottom-0.5 left-0 right-0 text-[8px] leading-none font-semibold text-[#c2410c]/70">Penuh</span>}
                {key === options[0] && !selected && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 size-1 rounded-full bg-[#9a3412]" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-[#8a7a6d] flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-[#9a3412] inline-block" aria-hidden /> Tanggal tercepat
        </p>
      </div>
    </div>
  );

  return (
    <>
      {chip ? (
        <button
          type="button"
          onClick={() => {
            setMonth(monthOf(value));
            setOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label="Pilih tanggal lain"
          className={`w-[62px] shrink-0 rounded-2xl border-[1.5px] py-2 text-center text-[11px] shadow-[0_1px_2px_rgba(59,26,12,0.06)] ${
            chip.active ? 'border-[#9a3412] bg-[#fdf3ea] text-[#9a3412]' : 'border-[#eee7df] bg-white text-[#4b5563]'
          }`}
        >
          {chip.active ? formatLabel(value).split(',')[0].slice(0, 3) : 'Lainnya'}
          <svg viewBox="0 0 24 24" className="mx-auto my-0.5 size-6 text-[#9a3412]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
          </svg>
          {chip.active ? formatLabel(value).replace(/^[^,]*,\s*/, '').split(' ').slice(0, 2).join(' ') : 'tanggal'}
        </button>
      ) : (
      <button
        type="button"
        onClick={() => {
          setMonth(monthOf(value));
          setOpen(true);
        }}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#e8c9b0] bg-white px-3 py-2.5 text-left hover:border-[#9a3412] focus:outline-none focus:ring-2 focus:ring-[#9a3412]/20"
        aria-haspopup="dialog"
      >
        <span className="text-base sm:text-lg font-bold text-[#111827]">{formatLabel(value)}</span>
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[#9a3412]" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" strokeLinecap="round" />
        </svg>
      </button>
      )}

      {/* Rendered on <body>: the checkout cards use CSS filters (drop shadows), which would trap a fixed overlay inside them. */}
      {open && createPortal(calendar, document.body)}
    </>
  );
}
