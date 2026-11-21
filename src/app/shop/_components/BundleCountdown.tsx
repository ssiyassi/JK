'use client';

import { useEffect, useState } from 'react';
import { bundleClosesAt, weekdaysLabel, type Bundle } from '@/lib/shop/bundles';

const pad = (n: number) => String(n).padStart(2, '0');

/** Boxes to show (owner 16 Nov 2026: no seconds; on the last day only hours and minutes, with "Sisa"). */
export function leftParts(ms: number): { value: number; label: string }[] {
  const m = Math.max(0, Math.floor(ms / 60000));
  const parts = [
    { value: Math.floor(m / 1440), label: 'Hari' },
    { value: Math.floor((m % 1440) / 60), label: 'Jam' },
    { value: m % 60, label: 'Menit' },
  ];
  return parts[0].value > 0 ? parts : parts.slice(1);
}

/** Milliseconds until the bundle closes, ticking every second; null = no countdown (or before the page loaded). */
function useLeft(bundle: Bundle): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const closes = bundleClosesAt(bundle, now);
  if (closes === null || closes <= now || closes - now > 7 * 86400 * 1000) return null;
  return closes - now;
}

/** "Hanya Kamis–Minggu" for a weekly bundle that is counting down, else null. */
export function useWeeklyNote(bundle: Bundle): string | null {
  const left = useLeft(bundle);
  return left !== null && bundle.weekdays ? `Hanya ${weekdaysLabel(bundle.weekdays)}` : null;
}

/**
 * Countdown boxes (owner 16 Nov 2026: small boxes Hari / Jam / Mnt / Dtk next to "Paket Hemat"), until the bundle can
 * no longer be bought (weekly days or an end date within 7 days). Honest: the shop really hides it at that moment.
 * Shown after the page loads (the server does not know the visitor's clock).
 */
export default function BundleCountdown({ bundle, tone, size = 'sm' }: { bundle: Bundle; tone: 'dark' | 'light'; size?: 'sm' | 'md' }) {
  const left = useLeft(bundle);
  if (left === null) return null;
  const box = tone === 'dark' ? 'bg-[#fbbf24] text-[#3b1a0c]' : 'bg-[#9a3412] text-white';
  const label = tone === 'dark' ? 'text-white/80' : 'text-[#4b5563]';
  const parts = leftParts(left);
  const dims = size === 'md' ? 'h-8 w-[34px] text-[15px]' : 'h-[22px] w-[27px] text-[12px]';
  return (
    <div role="timer" aria-label="Sisa waktu paket" className="flex shrink-0 items-start gap-[3px]">
      {parts.length === 2 && <span className={`mr-0.5 flex h-[22px] items-center text-[11px] font-bold ${tone === 'dark' ? 'text-white' : 'text-[#3b1a0c]'}`}>Sisa</span>}
      {parts.map((p) => (
        <div key={p.label} className="flex flex-col items-center">
          <span className={`flex items-center justify-center rounded-[6px] font-extrabold tabular-nums ${dims} ${box}`}>{pad(p.value)}</span>
          <span className={`mt-[2px] font-semibold leading-none ${size === 'md' ? 'text-[10px]' : 'text-[8.5px]'} ${label}`}>{p.label}</span>
        </div>
      ))}
    </div>
  );
}
