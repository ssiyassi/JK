'use client';

import { useEffect, useRef, useState } from 'react';
import { postJson, useShop } from '../_components/ShopProvider';

// "Buat Postermu di Sini": a reseller picks a design, a delivery date and writes their name + phone, and the phone
// draws them onto the owner's poster template (canvas; only the typed details are logged, for Website → Payday). Templates are 1024x1536;
// the boxes below are the empty white fields in each design.
type Box = { x: number; y: number; w: number; h: number };
const TEMPLATES = {
  'babi-sapi': {
    label: 'Babi + Sapi',
    src: '/shop/reseller/payday/poster-babi-sapi.webp',
    date: { x: 432, y: 322, w: 430, h: 66 },
    contact: { x: 77, y: 1374, w: 870, h: 90 },
  },
  sapi: {
    label: 'Sapi saja',
    src: '/shop/reseller/payday/poster-sapi.webp',
    date: { x: 436, y: 345, w: 404, h: 64 },
    contact: { x: 79, y: 1330, w: 866, h: 140 },
  },
} satisfies Record<string, { label: string; src: string; date: Box; contact: Box }>;
type Kind = keyof typeof TEMPLATES;

const BROWN = '#3b1a0c';
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function dateText(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Poster gagal dimuat, coba lagi.'));
    img.src = src;
  });
}

/** Writes one centred line, shrinking the font until it fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, size: number, weight: number, family: string, color: string) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 1;
  } while (s > 12);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

async function drawPoster(kind: Kind, date: string, name: string, phone: string, family: string) {
  const t = TEMPLATES[kind];
  const img = await loadImage(t.src);
  await document.fonts.load(`800 40px ${family}`).catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const d = t.date;
  fitText(ctx, dateText(date), d.x + d.w / 2, d.y + d.h / 2 + 2, d.w - 40, 32, 800, family, BROWN);
  const c = t.contact;
  fitText(ctx, `${name} - ${phone}`, c.x + c.w / 2, c.y + c.h / 2 + 2, c.w - 50, Math.min(60, Math.round(c.h * 0.5)), 800, family, BROWN);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Poster gagal dibuat.'))), 'image/jpeg', 0.92));
}

const OPEN_EVENT = 'jk-open-poster-maker';

/** Same button above the promo poster: opens the form below and scrolls to it. */
export function PosterMakerTopButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} className="mb-4 w-full rounded-full bg-[#9a3412] px-5 py-3.5 text-base font-bold text-white shadow-md">
      🎨 Buat Postermu di Sini
    </button>
  );
}

export default function PosterMaker() {
  const { base } = useShop();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('babi-sapi');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [poster, setPoster] = useState<{ url: string; blob: Blob } | null>(null);

  useEffect(() => {
    const show = () => {
      setOpen(true);
      requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  useEffect(() => () => {
    if (poster) URL.revokeObjectURL(poster.url);
  }, [poster]);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date) return setError('Pilih tanggal delivery dulu ya.');
    if (!name.trim()) return setError('Tulis nama kamu dulu ya.');
    if (phone.replace(/\D/g, '').length < 9) return setError('Tulis nomor WhatsApp kamu dulu ya.');
    setBusy(true);
    try {
      const family = root.current ? getComputedStyle(root.current).fontFamily : 'sans-serif';
      const blob = await drawPoster(kind, date, name.trim(), phone.trim(), family);
      setPoster({ url: URL.createObjectURL(blob), blob });
      // For the list in Website → Payday; the poster works even if this fails.
      postJson(base, '/payday-poster', { kind, deliveryDate: date, name: name.trim(), phone: phone.trim() }).catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!poster) return;
    const file = new File([poster.blob], `payday-promo-${date}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = poster.url;
    a.download = file.name;
    a.click();
  }

  const field = 'mt-1 w-full rounded-xl border border-[#e5c9b3] bg-white px-4 py-3 text-base text-[#2b211b] focus:border-[#9a3412] focus:outline-none';

  return (
    <div ref={root} className="mt-5 scroll-mt-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="w-full rounded-full bg-[#9a3412] px-5 py-3.5 text-base font-bold text-white shadow-md">
          🎨 Buat Postermu di Sini
        </button>
      ) : (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-center text-lg font-bold text-[#3b1a0c]">Buat Postermu</h2>
          {poster ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={poster.url} alt="Poster Payday Promo kamu" className="mt-3 w-full rounded-xl shadow" />
              <p className="mt-2 text-center text-xs text-[#8a7a6d]">Ketuk dan tahan foto untuk menyimpan.</p>
              <button type="button" onClick={save} className="mt-3 w-full rounded-full bg-[#25D366] px-5 py-3 font-semibold text-white">
                Simpan / Bagikan Poster
              </button>
              <button type="button" onClick={() => setPoster(null)} className="mt-2 w-full rounded-full border-2 border-[#9a3412] px-5 py-2.5 font-semibold text-[#9a3412]">
                Ubah poster
              </button>
            </>
          ) : (
            <form onSubmit={make} className="mt-3 space-y-4">
              <div>
                <div className="text-sm font-semibold text-[#3b1a0c]">1. Pilih poster</div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(Object.keys(TEMPLATES) as Kind[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`overflow-hidden rounded-xl border-[3px] text-sm font-bold ${kind === k ? 'border-[#9a3412] text-[#9a3412]' : 'border-transparent text-[#8a7a6d]'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={TEMPLATES[k].src} alt={TEMPLATES[k].label} className="w-full" />
                      <span className="block py-1.5">
                        {kind === k ? '✓ ' : ''}
                        {TEMPLATES[k].label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-semibold text-[#3b1a0c]">
                2. Tanggal delivery
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-semibold text-[#3b1a0c]">
                3. Nama kamu
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Contoh: Dapur Bu Sari" className={field} />
              </label>
              <label className="block text-sm font-semibold text-[#3b1a0c]">
                4. Nomor WhatsApp kamu
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} placeholder="0812xxxxxxxx" className={field} />
              </label>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy} className="w-full rounded-full bg-[#9a3412] px-5 py-3 font-semibold text-white disabled:bg-gray-400">
                {busy ? 'Membuat poster…' : 'Buat Poster'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
