'use client';

import { useEffect, useState } from 'react';
import type { StampCard } from '@/lib/notify/stamps';
import { postJson, useShop } from '../_components/ShopProvider';

const LOGO = '/shop/brand/logo.png';
const PHONE_KEY = 'jk-stamp-phone';

/** Look of each level (design approved by the owner, 2026-11-01): colour, product photo, reward icon. */
const LOOK: Record<number, { c1: string; c2: string; soft: string; photo: string }> = {
  1: { c1: '#22c55e', c2: '#15803d', soft: '#bbf7d0', photo: '/shop/reseller/foto/foto-07-thumb.jpg' },
  2: { c1: '#3b82f6', c2: '#1d4ed8', soft: '#bfdbfe', photo: '/shop/reseller/foto/foto-08-thumb.jpg' },
  3: { c1: '#ec4899', c2: '#be185d', soft: '#fbcfe8', photo: '/shop/reseller/foto/foto-01-thumb.jpg' },
  4: { c1: '#f59e0b', c2: '#b45309', soft: '#fde68a', photo: '/shop/reseller/foto/foto-04-thumb.jpg' },
};

const STAMP_NAME: Record<number, string> = { 1: 'PEMULA', 2: 'JAGOAN', 3: 'JURAGAN', 4: 'SULTAN' };

/** Total profit a reseller has made once a level is full (selling profit + rewards so far), figures from the owner. */
const PROFIT: Record<number, string> = { 1: 'Rp460.000', 2: 'Rp980.000', 3: 'Rp2.430.000', 4: 'Rp5.480.000' };

const fmtDate = (ms: number) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(ms));
const boxes = (n: number) => String(n).replace('.', ',');

function Logo({ className, color }: { className: string; color: string }) {
  const mask = `url(${LOGO}) center / contain no-repeat`;
  return <i aria-hidden="true" className={`block ${className}`} style={{ background: color, WebkitMask: mask, mask }} />;
}

function RewardIcon({ kind }: { kind: 'box' | 'cash' }) {
  return kind === 'box' ? (
    <svg viewBox="0 0 24 24" className="w-[60%] fill-[#92400e]" aria-hidden="true">
      <path d="M20 8h-2.2A3 3 0 0 0 12 4.8 3 3 0 0 0 6.2 8H4a1 1 0 0 0-1 1v3h18V9a1 1 0 0 0-1-1Zm-11-2a1.5 1.5 0 0 1 1.5 1.5V8H9a1 1 0 0 1 0-2Zm6 2h-1.5v-.5A1.5 1.5 0 1 1 15 8ZM4 13h7.2v8H5a1 1 0 0 1-1-1Zm8.8 0H20v7a1 1 0 0 1-1 1h-6.2Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-[60%] fill-[#92400e]" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15.9V19h-2v-1.1c-1.5-.3-2.7-1.2-2.8-2.8h1.9c.1.8.7 1.3 1.9 1.3 1.3 0 1.7-.6 1.7-1.1 0-.7-.4-1.1-2.1-1.5-1.9-.5-3.2-1.2-3.2-2.8 0-1.3 1-2.2 2.6-2.5V7.4h2v1.1c1.4.3 2.3 1.2 2.4 2.6h-1.9c-.1-.7-.5-1.2-1.6-1.2-1 0-1.6.5-1.6 1.1 0 .6.5.9 2 1.3 2 .5 3.4 1.2 3.4 3 0 1.4-1 2.3-2.7 2.6Z" />
    </svg>
  );
}

function LevelCard({ l, round, left }: { l: StampCard['levels'][number]; round: number; left: number }) {
  const look = LOOK[l.level];
  const size = l.upTo - l.from;
  const cols = size <= 15 ? 5 : size >= 40 ? 8 : 7;
  const pct = Math.round((100 * l.filled) / size);
  return (
    <section
      className="relative mt-4 overflow-hidden rounded-[22px] p-3.5 text-white"
      style={{ background: `linear-gradient(145deg, ${look.c1}, ${look.c2})`, boxShadow: `0 10px 24px -8px ${look.c2}` }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[.13]"
        style={{ backgroundImage: 'radial-gradient(circle at 20px 20px,#fff 2px,transparent 3px),radial-gradient(circle at 60px 50px,#fff 1.5px,transparent 2.5px)', backgroundSize: '80px 70px' }}
      />
      <div className="pointer-events-none absolute -bottom-16 -right-12 h-44 w-44 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-2.5">
        <div className="h-[54px] w-[54px] shrink-0 rounded-2xl border-[3px] border-white/85 bg-cover bg-center shadow-md" style={{ backgroundImage: `url(${look.photo})` }} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black tracking-[.12em] opacity-90">
            LEVEL {l.level} · {l.name}
          </div>
          <div className="text-[17px] font-black leading-tight">{l.reward}</div>
          <div className="text-[11px] opacity-90">{l.upTo} box{round ? ` · putaran ${round + 1}` : ''}</div>
        </div>
        <span className="self-start whitespace-nowrap rounded-full bg-white px-2 py-1 text-[9px] font-black" style={{ color: look.c2 }}>
          {l.state === 'done' ? '✓ SELESAI' : l.state === 'now' ? 'SEDANG JALAN' : '🔒 TERKUNCI'}
        </span>
      </div>
      <div className="relative z-20 mt-3 flex items-center justify-between gap-2 rounded-xl bg-black/25 px-3 py-2">
        <span className="text-[12px] font-semibold leading-tight opacity-95 [text-wrap:balance]">💰 {l.state === 'done' ? 'Penghasilan yang sudah di dapat' : 'Potensi penghasilan kamu'}</span>
        <b className="text-[19px] font-black leading-none text-[#fde68a]">{PROFIT[l.level]}</b>
      </div>
      <div className="relative mt-3 h-[7px] overflow-hidden rounded-full bg-white/30">
        <i className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
      <div className="relative mt-3 grid gap-[7px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: size }, (_, i) => {
          const last = i === size - 1;
          if (i < l.filled)
            return (
              <div
                key={i}
                className="flex aspect-square -rotate-[10deg] items-center justify-center rounded-full border-2 border-white/85 shadow-md"
                style={{ background: 'radial-gradient(circle at 35% 30%, #a0522d, #6b2f12 70%, #4a1f0c)' }}
              >
                <Logo className="h-[86%] w-[86%]" color="#fff" />
              </div>
            );
          if (last)
            return (
              <div key={i} className="flex aspect-square items-center justify-center rounded-full shadow-[0_0_0_3px_rgba(255,255,255,.6),0_0_14px_#fde68a]" style={{ background: 'radial-gradient(circle,#fff7c2,#fbbf24)' }}>
                <RewardIcon kind={l.kind} />
              </div>
            );
          return (
            <div key={i} className="flex aspect-square items-center justify-center rounded-full border-2 border-dashed border-white/55 bg-white/[.08] text-[10px] font-extrabold text-white/75">
              {l.from + i + 1}
            </div>
          );
        })}
      </div>
      <div className={`relative mt-3 rounded-xl bg-white/95 px-3 py-2 text-[13px] ${l.state === 'lock' ? 'invisible' : ''}`} style={{ color: look.c2 }}>
        {l.state === 'done' ? (
          <>
            🎉 Reward didapat: <b>{l.reward}</b>
          </>
        ) : l.state === 'now' ? (
          <>
            <b>{boxes(left)} box lagi</b> menuju <b>{l.reward}</b>
          </>
        ) : (
          <>Terbuka setelah Level {l.level - 1} penuh</>
        )}
      </div>
      {l.state === 'lock' && (
        // Locked level: dark shade over the card with a lock pill (owner's reference: loyalty app "Kartu terkunci").
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/[.68] px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/85 px-5 py-2.5 text-[15px] font-semibold shadow-lg">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-white stroke-2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Kartu terkunci
          </span>
          <span className="text-[13px] font-semibold drop-shadow">Kumpulkan stamp untuk membuka kartu ini</span>
          <span className="text-[11px] opacity-80">Terbuka setelah Level {l.level - 1} {STAMP_NAME[l.level - 1]} penuh</span>
        </div>
      )}
    </section>
  );
}

function Card({ card, phone }: { card: StampCard; phone: string }) {
  const current = card.levels.find((l) => l.state === 'now');
  return (
    <div className="mt-4">
      <div className="relative overflow-hidden rounded-[22px] p-4 text-white" style={{ background: 'linear-gradient(135deg,#4a1f0c,#9a3412)' }}>
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[#fbbf24]/20" />
        <div className="relative text-[19px] font-black">Halo, {card.reseller} 👋</div>
        <div className="relative text-xs text-[#fde2cc]">
          Periode {card.periodLabel} · {phone}
        </div>
        <div className="relative mt-2 flex items-end gap-2">
          <b className="text-[46px] font-black leading-none text-[#fbbf24]">{boxes(card.total)}</b>
          <span className="pb-1.5 text-[13px] text-[#fde2cc]">
            box terkumpul{current ? ` · Level ${current.level} ${current.name}` : ''}
          </span>
        </div>
        {card.next && (
          <div className="relative mt-2.5 rounded-xl bg-[#fbbf24] px-3 py-2 text-[13px] font-black text-[#5a1d07]">
            🎯 {boxes(card.next.left)} box lagi menuju {card.next.reward}
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {card.levels.map((l) => (
          <div
            key={l.level}
            className={`rounded-xl px-1 py-1.5 text-center text-[10px] font-black leading-snug text-white ${l.state === 'lock' ? 'opacity-55' : ''}`}
            style={{ background: `linear-gradient(145deg, ${LOOK[l.level].c1}, ${LOOK[l.level].c2})`, boxShadow: l.state === 'now' ? `0 0 0 3px ${LOOK[l.level].soft}` : undefined }}
          >
            {l.level} {l.state === 'done' ? '✓' : l.state === 'lock' ? '🔒' : `· ${l.filled}/${l.upTo - l.from}`}
            <br />
            {l.name}
          </div>
        ))}
      </div>
      {card.levels.map((l) => (
        <LevelCard key={l.level} l={l} round={card.round} left={card.next?.left ?? 0} />
      ))}
      <div className="mt-4 rounded-[20px] bg-white p-3.5">
        <h2 className="text-sm font-bold">Stamp terakhir</h2>
        {card.recent.length ? (
          card.recent.map((d) => (
            <div key={d.orderId} className="flex items-center justify-between border-b border-[#f3e3d3] py-2 text-[13px] last:border-0">
              <span>
                {fmtDate(d.deliveredAt)} · Order {d.orderId}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#6b2f12] px-2 py-0.5 font-black text-white">
                <Logo className="h-4 w-4" color="#fff" />+{boxes(d.boxes)}
              </span>
            </div>
          ))
        ) : (
          <p className="mt-1 text-[13px] text-[#8a7a6d]">Belum ada pesanan yang sampai di periode ini. Yuk mulai jualan!</p>
        )}
      </div>
    </div>
  );
}

export default function StampPortal({ whatsapp }: { whatsapp: string }) {
  const { base } = useShop();
  const [phone, setPhone] = useState('');
  const [shown, setShown] = useState<string | null>(null);
  const [cards, setCards] = useState<StampCard[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(value: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ cards: StampCard[] }>(base, '/stamp', { phone: value });
      setCards(r.cards);
      setShown(value);
      try {
        localStorage.setItem(PHONE_KEY, value);
      } catch {
        // private mode: just not remembered
      }
    } catch (e) {
      setError((e as Error).message);
      setCards(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(PHONE_KEY);
    } catch {
      saved = null;
    }
    if (saved) {
      setPhone(saved);
      void load(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pb-6">
      {!cards ? (
        <form
          className="mt-5 rounded-[22px] bg-white p-4 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void load(phone);
          }}
        >
          <label className="block text-sm font-semibold text-[#3b1a0c]" htmlFor="stamp-phone">
            Nomor WhatsApp kamu
          </label>
          <input
            id="stamp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0812xxxxxxxx"
            className="mt-2 w-full rounded-xl border border-[#e5c9b3] px-4 py-3 text-base text-[#2b211b] focus:border-[#9a3412] focus:outline-none"
          />
          {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !phone.trim()} className="mt-3 w-full rounded-full bg-[#9a3412] px-5 py-3 font-semibold text-white disabled:bg-gray-400">
            {busy ? 'Memuat…' : 'Lihat kartu stamp'}
          </button>
          <p className="mt-3 text-xs text-[#8a7a6d]">Pakai nomor WhatsApp yang terdaftar sebagai reseller Jentis Kitchen.</p>
        </form>
      ) : (
        <>
          {cards.map((c) => (
            <Card key={`${c.reseller}-${c.parentReseller ?? ''}`} card={c} phone={shown ?? ''} />
          ))}
          <p className="mt-3 text-[11px] leading-relaxed text-[#8a7a6d]">
            1 stamp = 1 box (Paket Payday: 3 box = 2 stamp). Stamp masuk saat pesanan sampai. Kartu mulai lagi dari 0 setiap awal periode (Jan–Feb, Mar–Apr,
            Mei–Jun, Jul–Agu, Sep–Okt, Nov–Des). Setelah 100 box, Level 1–4 mulai lagi dan reward bisa didapat lagi.
          </p>
        </>
      )}
      <a href={`https://wa.me/${whatsapp}`} className="mt-3 block w-full rounded-full bg-[#25D366] px-5 py-3 text-center font-semibold text-white">
        Kembali ke WhatsApp
      </a>
    </div>
  );
}
