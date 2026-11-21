'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { deliveryDateFromKey, jakartaDateKey, SAME_DAY_CUTOFF_HOUR, websiteDeliveryOptions } from '@/lib/core/time';
import { timeAgo, type SocialProof } from '@/lib/shop/social-proof-text';
import { FREE_DELIVERY_FROM } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

// Snack bar of real recent orders, "box terjual" line and the same-day delivery countdown (src/lib/shop/socialProof.ts).
// One fetch per page load, shared by every part; nothing shows when it fails.
let request: Promise<SocialProof | null> | null = null;
function useSocialProof(): SocialProof | null {
  const [data, setData] = useState<SocialProof | null>(null);
  useEffect(() => {
    request ??= fetch('/shop/api/social-proof')
      .then((r) => (r.ok ? (r.json() as Promise<SocialProof>) : null))
      .catch(() => null);
    let live = true;
    request.then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, []);
  return data;
}

const FIRST_MS = 5_000;
const SHOW_MS = 6_500;
const GAP_MS: [number, number] = [2_000, 8_000]; // random pause between two messages (owner: 2–8 s)
const MAX_PER_PAGE = 20;
const DISMISS_KEY = 'jk_sp_off';

const shuffle = <T,>(list: T[]) => list.map((v) => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

/** Shuffled order lines, with the lines of one order kept apart (never one right after another when avoidable). */
function spreadOrders(lines: SocialProof['recent']): SocialProof['recent'] {
  const left = shuffle(lines);
  const out: SocialProof['recent'] = [];
  while (left.length) {
    const i = left.findIndex((l) => l.order !== out[out.length - 1]?.order);
    out.push(...left.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

type Toast = { icon: string; text: React.ReactNode; sub?: string; checkout?: boolean };

/** One real order in one of several wordings ("Ri*** di Bekasi membeli…", "Ri*** dari… baru memesan…", …). */
function orderToast(o: SocialProof['recent'][number], now: number): Toast {
  const what = (
    <b>
      {o.qty} box {o.product}
    </b>
  );
  const where = o.area ?? null;
  const who = <b>{o.name ?? 'Pelanggan'}</b>;
  const text = pick([
    <>{who}{where ? ` di ${where}` : ''} membeli {what}</>,
    <>{who}{where ? ` dari ${where}` : ''} baru memesan {what}</>,
    <>{what} sedang disiapkan untuk {who}{where ? ` di ${where}` : ''}</>,
    <>{who}{where ? ` di ${where}` : ''} stok {what} untuk di rumah</>,
  ]);
  return { icon: pick(['🛒', '🛍️', '📦']), text, sub: timeAgo(o.at, now) };
}

/** Facts from the same real data: best sellers, boxes sold, orders today and the delivery cutoff. */
function factToasts(d: SocialProof, now: number): Toast[] {
  const out: Toast[] = [];
  const [top, ...rest] = d.soldByProduct;
  if (top && top.boxes >= 10) out.push({ icon: '🔥', text: <><b>{top.name}</b> paling laris: {top.boxes} box terjual</>, sub: '30 hari terakhir' });
  for (const p of rest.filter((p) => p.boxes >= 10)) out.push({ icon: '🔥', text: <><b>{p.boxes} box {p.name}</b> sudah terjual</>, sub: '30 hari terakhir' });
  if (d.soldBoxes >= 20) out.push({ icon: '📈', text: <><b>{d.soldBoxes.toLocaleString('id-ID')} box</b> terjual dari semua pembeli kami</>, sub: '30 hari terakhir' });
  if (d.todayOrders >= 2) out.push({ icon: '⚡', text: <><b>{d.todayOrders} pesanan</b> sudah masuk hari ini</>, sub: 'Hari ini' });
  const first = websiteDeliveryOptions(now, d.closedDays)[0];
  const today = jakartaDateKey(now);
  const cutoff = Date.parse(`${today}T${two(SAME_DAY_CUTOFF_HOUR)}:00:00+07:00`);
  if (first === today && now < cutoff) {
    const min = Math.floor((cutoff - now) / 60_000);
    out.push({ icon: '⏰', text: <>Pesan sebelum <b>{SAME_DAY_CUTOFF_HOUR}:00</b>, dikirim <b>hari ini</b></>, sub: `Sisa waktu ${Math.floor(min / 60)} jam ${min % 60} menit` });
  } else {
    out.push({ icon: '🚚', text: <>Pesan sekarang, dikirim <b>{dayLabel(first)}</b></>, sub: 'Pengiriman tercepat' });
  }
  return out;
}

/** Nudges for this visitor's own cart (free delivery from FREE_DELIVERY_FROM boxes, finish the order). */
function cartToasts(cartCount: number): Toast[] {
  if (cartCount === 0) return [];
  const out: Toast[] = [{ icon: '🛒', text: <><b>{cartCount} box</b> di keranjangmu belum dipesan</>, sub: 'Selesaikan sebelum kehabisan', checkout: true }];
  if (cartCount < FREE_DELIVERY_FROM) out.push({ icon: '🎁', text: <>Tambah <b>{FREE_DELIVERY_FROM - cartCount} box lagi</b>, ongkir jadi GRATIS</>, sub: 'Hemat Rp15.000', checkout: true });
  return out;
}

/**
 * Snack bar just under the header on the right (owner, 2026-11-06: more noticeable than bottom left), with varied messages, all from real orders (src/lib/shop/socialProof.ts): recent orders in several
 * wordings (one product per message), best sellers, boxes sold, orders today, the delivery cutoff and nudges for the
 * visitor's own cart. Buyer names only masked ("Ja***"). Closing it (×) hides it for the rest of the visit.
 */
export function SocialProofToast() {
  const data = useSocialProof();
  const { cartCount, href } = useShop();
  const [shown, setShown] = useState<Toast | null>(null);
  const [off, setOff] = useState(false);
  const cartRef = useRef(cartCount);
  useEffect(() => {
    cartRef.current = cartCount;
  }, [cartCount]);

  useEffect(() => {
    if (!data || (!data.recent.length && !data.soldBoxes)) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {}
    const orders = spreadOrders(data.recent);
    let facts: Toast[] = [];
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    // Pattern: order, fact, order, cart nudge (if any), order, fact, …
    const nextToast = (): Toast | null => {
      const now = Date.now();
      const slot = n % 4;
      if (slot === 3) {
        const cart = cartToasts(cartRef.current);
        if (cart.length) return pick(cart);
      }
      if (slot === 1 || slot === 3 || !orders.length) {
        if (!facts.length) facts = shuffle(factToasts(data, now));
        const f = facts.shift();
        if (f) return f;
      }
      if (!orders.length) orders.push(...spreadOrders(data.recent)); // a short list goes round again
      const o = orders.shift();
      return o ? orderToast(o, now) : null;
    };
    const next = (wait: number) => {
      timer = setTimeout(() => {
        const t = n < MAX_PER_PAGE ? nextToast() : null;
        n++;
        if (!t) return;
        setShown(t);
        timer = setTimeout(() => {
          setShown(null);
          next(GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]));
        }, SHOW_MS);
      }, wait);
    };
    next(FIRST_MS);
    return () => clearTimeout(timer);
  }, [data]);

  if (off || !shown) return null;
  const close = () => {
    setOff(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };
  return (
    <div
      role="status"
      className="fixed left-3 right-3 top-[76px] sm:left-auto sm:right-6 sm:top-[116px] sm:w-[440px] z-40 animate-[jk-pop_.4s_ease-out]"
    >
      <style>{'@keyframes jk-pop{from{opacity:0;transform:translate(32px,-8px)}to{opacity:1;transform:none}}'}</style>
      <div className="flex items-center gap-3 sm:gap-4 rounded-2xl border border-[#f3d9c4] bg-white/95 px-3.5 py-2.5 sm:px-5 sm:py-4 shadow-[0_6px_20px_rgba(0,0,0,0.15)] backdrop-blur">
        <span className="flex size-9 sm:size-12 shrink-0 items-center justify-center rounded-full bg-[#fdf3ea] text-lg sm:text-2xl" aria-hidden>
          {shown.icon}
        </span>
        <p className="flex-1 text-[13px] leading-[18px] sm:text-base sm:leading-6 text-[#3b1a0c]">
          {shown.text}
          {shown.sub && <span className="block text-[11px] sm:text-sm text-[#8a7a6d]">{shown.sub}</span>}
        </p>
        {shown.checkout && cartCount > 0 && (
          <Link href={href('/checkout')} className="shrink-0 rounded-full bg-[#9a3412] px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-white">
            Checkout
          </Link>
        )}
        <button type="button" onClick={close} className="self-start px-1 text-lg sm:text-2xl leading-none text-[#b6a597] hover:text-[#5c4d42]" aria-label="Tutup">
          ×
        </button>
      </div>
    </div>
  );
}

/** "🔥 245 box terjual dalam 30 hari terakhir" (all channels, real orders). Hidden below 20 boxes. */
export function SoldCount({ className = '' }: { className?: string }) {
  const data = useSocialProof();
  if (!data || data.soldBoxes < 20) return null;
  return (
    <p className={`inline-flex items-center gap-1.5 rounded-full bg-[#fef2f2] px-3 py-1 text-xs sm:text-sm font-semibold text-[#b91c1c] ${className}`}>
      <span aria-hidden>🔥</span>
      {data.soldBoxes.toLocaleString('id-ID')} box terjual dalam 30 hari terakhir
    </p>
  );
}

/** "🔥 147 box terjual · 30 hari terakhir" for one product (key = stock column), real orders. Shown on every product
 * that sold at least 1 box (owner, 2026-11-07: show the number on each product). */
export function ProductSold({ productKey, className = '', short = false }: { productKey: string; className?: string; short?: boolean }) {
  const data = useSocialProof();
  const boxes = data?.soldByProduct.find((p) => p.key === productKey)?.boxes ?? 0;
  if (boxes < 1) return null;
  return (
    <p className={`flex items-center gap-1 text-xs sm:text-sm font-semibold text-[#b91c1c] ${className}`}>
      <span aria-hidden>🔥</span>
      {boxes.toLocaleString('id-ID')} {short ? 'terjual' : 'box terjual'}
      <span className="font-normal text-[#9ca3af]">{short ? '· 30 hari' : '· 30 hari terakhir'}</span>
    </p>
  );
}

const two = (n: number) => String(n).padStart(2, '0');
const dayLabel = (key: string) =>
  new Date(deliveryDateFromKey(key)).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * Before 14:00 WIB on a delivery day: "⏰ Pesan dalam 2:14:05 lagi, dikirim HARI INI" (ticks every second).
 * Otherwise the soonest real delivery day from the same rules as checkout.
 */
export function DeliveryCountdown({ className = '' }: { className?: string }) {
  const data = useSocialProof();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  if (!data || now === null) return null;
  const first = websiteDeliveryOptions(now, data.closedDays)[0];
  const today = jakartaDateKey(now);
  const cutoff = Date.parse(`${today}T${two(SAME_DAY_CUTOFF_HOUR)}:00:00+07:00`);
  const box = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs sm:text-sm font-semibold ${className}`;
  if (first === today && now < cutoff) {
    const s = Math.floor((cutoff - now) / 1000);
    return (
      <p className={`${box} bg-[#fff7ed] text-[#9a3412]`}>
        <span aria-hidden>⏰</span>
        Pesan dalam <b className="tabular-nums">{`${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`}</b> lagi, dikirim HARI INI
      </p>
    );
  }
  return (
    <p className={`${box} bg-[#f0fdf4] text-[#166534]`}>
      <span aria-hidden>🚚</span>
      Pesan sekarang, dikirim {first === today ? 'hari ini' : dayLabel(first)}
    </p>
  );
}
