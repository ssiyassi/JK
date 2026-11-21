import type { Metadata } from 'next';
import Link from 'next/link';
import { shopBase } from '@/lib/shop/server';
import { playfair } from '../fonts';
import ResellerProducts from './ResellerProducts';
import ResellerWhatsApp from './ResellerWhatsApp';

// Public "Jadi Reseller" page (owner, 2026-11-06): the reseller scheme in plain words, worked examples and one way in,
// WhatsApp to the owner. Prices are the owner's: Babi/Sapi 500 g sells at Rp160.000, resellers pay Rp140.000. The
// reward tiers and examples follow /hadiah-reseller and the stamp card (PROFIT in stamp/StampPortal.tsx); change them
// together. Not for Google (the shop's SEO is for retail buyers), so noindex.
const PRICE = 160_000;
const RESELLER = 140_000;
const MARGIN = PRICE - RESELLER;
const MIN_FIRST = 10;
const SHIPPING_ONE = 15_000;

const TITLE = 'Jadi Reseller';
const DESCRIPTION = `Jual daging marinasi siap panggang Jentis Kitchen dan untung Rp${(MARGIN / 1000).toFixed(0)}.000 di setiap box, langsung dari order pertama.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  openGraph: { type: 'website', siteName: 'Jentis Kitchen', title: 'Jadi Reseller Jentis Kitchen', description: DESCRIPTION, images: ['/shop/reseller/jadi-reseller-boxes.jpg'] },
};

const rp = (n: number) => `Rp${n.toLocaleString('id-ID')}`;

const STEPS: { title: string; body: string }[] = [
  { title: `Order pertama minimal ${MIN_FIRST} box`, body: 'Setelah itu, order berikutnya bebas berapa saja.' },
  { title: `Bayar ${rp(RESELLER)} per box`, body: `Harga jual ${rp(PRICE)} per box, jadi kamu langsung untung ${rp(MARGIN)} di setiap box.` },
  { title: 'Kami kirim ke alamat tujuan', body: `Ongkir per alamat: 1 box ${rp(SHIPPING_ONE)}, mulai 2 box GRATIS ongkir.` },
];

const TIERS: [string, string][] = [
  ['15 box', 'GRATIS 1 box'],
  ['25 box', 'GRATIS 2 box LAGI'],
  ['65 box', 'CASH Rp650.000'],
  ['100 box', 'CASH Rp2.350.000 LAGI'],
];

type Line = [string, string, boolean?];
const EXAMPLES: { title: string; lines: Line[]; note?: string }[] = [
  {
    title: `Order pertama ${MIN_FIRST} box`,
    lines: [
      ['Kamu bayar ke Jentis', `${MIN_FIRST} × ${rp(RESELLER)} = ${rp(MIN_FIRST * RESELLER)}`],
      ['Kamu jual ke pembeli', `${MIN_FIRST} × ${rp(PRICE)} = ${rp(MIN_FIRST * PRICE)}`],
      ['Untung kamu', rp(MIN_FIRST * MARGIN), true],
    ],
  },
  {
    title: 'Kirim ke pembeli',
    lines: [
      ['Bu Rina pesan 2 box', 'ongkir GRATIS'],
      ['Pak Andi pesan 1 box', `ongkir ${rp(SHIPPING_ONE)}`],
    ],
    note: 'Tips: tawarkan 2 box ke pembeli supaya ongkirnya gratis.',
  },
  {
    title: 'Jual 25 box dalam November – Desember',
    lines: [
      ['Untung jual', `25 × ${rp(MARGIN)} = ${rp(25 * MARGIN)}`],
      ['Hadiah GRATIS 3 box', rp(3 * PRICE)],
      ['Total untung kamu', rp(25 * MARGIN + 3 * PRICE), true],
    ],
  },
  {
    title: 'Jual 100 box dalam November – Desember',
    lines: [
      ['Untung jual', `100 × ${rp(MARGIN)} = ${rp(100 * MARGIN)}`],
      ['Hadiah GRATIS 3 box', rp(3 * PRICE)],
      ['Hadiah CASH', 'Rp650.000 + Rp2.350.000'],
      ['Total untung kamu', rp(100 * MARGIN + 3 * PRICE + 3_000_000), true],
    ],
  },
];

const PERKS = [
  'Foto produk siap pakai untuk promosi di WhatsApp dan Instagram.',
  'Laporan progres hadiah kamu lewat WhatsApp setiap hari Minggu.',
  'Kartu stamp online untuk cek hadiah kapan saja.',
  'Daging full tanpa lemak, sudah dimarinasi, tinggal panggang — mudah dijual ulang.',
];

const H2 = 'font-[family-name:var(--font-heading)] text-xl sm:text-2xl font-bold text-[#3b1a0c]';
const CARD = 'rounded-2xl bg-[#fdf3ea] p-4 sm:p-5';

export default async function JadiResellerPage() {
  const base = await shopBase();
  return (
    <div className={`${playfair.variable} max-w-xl mx-auto pb-24 sm:pb-6 text-[#3b1a0c]`}>
      <section className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#9a3412]">Peluang usaha dari rumah</p>
        <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold">Jadi Reseller Jentis Kitchen</h1>
        <p className="mt-3 text-base text-[#5c4d42]">
          Jual daging marinasi siap panggang dan <b className="text-[#15803d]">untung {rp(MARGIN)} di setiap box</b>, langsung dari order pertama.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/shop/reseller/jadi-reseller-boxes.jpg"
          width={1200}
          height={908}
          alt="Box daging marinasi Jentis Kitchen"
          className="mt-5 w-full h-auto rounded-2xl shadow-md"
        />
        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          {[
            ['Harga reseller', rp(RESELLER)],
            ['Harga jual', rp(PRICE)],
            ['Untung / box', rp(MARGIN)],
          ].map(([k, v], i) => (
            <div key={k} className={`rounded-xl p-2.5 ${i === 2 ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fdf3ea]'}`}>
              <p className="text-[11px] sm:text-xs text-[#8a7a6d]">{k}</p>
              <p className="text-sm sm:text-base font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#8a7a6d]">Berlaku untuk semua box Babi &amp; Sapi Marinade 500 g.</p>
        <ResellerWhatsApp where="top" className="mt-5" />
      </section>

      <section className="mt-10">
        <h2 className={H2}>Cara kerjanya</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`${CARD} flex gap-3`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#9a3412] font-bold text-white">{i + 1}</span>
              <div>
                <p className="font-bold">{s.title}</p>
                <p className="text-sm text-[#5c4d42]">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-10">
        <h2 className={H2}>Produk yang kamu jual</h2>
        <p className="mt-1 text-sm text-[#5c4d42]">Daging marinasi siap panggang, 500 g per box. Mohon perhatikan: produk kami mengandung babi atau sapi yang belum bersertifikat halal.</p>
        <ResellerProducts />
      </section>

      <section className="mt-10">
        <h2 className={H2}>Bonus hadiah November – Desember 2026</h2>
        <p className="mt-1 text-sm text-[#5c4d42]">Selain untung per box, ada hadiah tambahan dari jumlah box yang kamu jual dalam 2 bulan.</p>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {TIERS.map(([q, r]) => (
            <li key={q} className="rounded-xl border-2 border-[#fed7aa] bg-white p-3 text-center">
              <p className="text-sm text-[#8a7a6d]">{q}</p>
              <p className="font-extrabold text-[#9a3412]">{r}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-3 space-y-1 text-xs text-[#5c4d42] list-disc pl-5">
          <li>Box gratis tidak ikut dihitung.</li>
          <li>Setelah 100 box, hitungan mulai lagi dari 0 dan hadiah bisa didapat lagi.</li>
        </ul>
        <Link href={`${base}/hadiah-reseller`} className="mt-2 inline-block text-sm font-semibold text-[#9a3412] underline">
          Lihat poster hadiah
        </Link>
      </section>

      <section className="mt-10">
        <h2 className={H2}>Contoh hitungan</h2>
        <div className="mt-4 space-y-3">
          {EXAMPLES.map((e, i) => (
            <div key={e.title} className={CARD}>
              <p className="font-bold">
                <span className="text-[#9a3412]">Contoh {i + 1}:</span> {e.title}
              </p>
              <dl className="mt-2 space-y-1 text-sm">
                {e.lines.map(([k, v, total]) => (
                  <div key={k} className={`flex justify-between gap-3 ${total ? 'mt-1 border-t border-[#f3d9c4] pt-1.5 text-base font-extrabold text-[#15803d]' : ''}`}>
                    <dt className={total ? '' : 'text-[#5c4d42]'}>{k}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
              {e.note && <p className="mt-2 text-xs text-[#5c4d42]">{e.note}</p>}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#8a7a6d]">Contoh memakai harga jual {rp(PRICE)} per box, belum termasuk ongkir.</p>
      </section>

      <section className="mt-10">
        <h2 className={H2}>Yang kamu dapat</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {PERKS.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-[#15803d] font-bold" aria-hidden>
                ✓
              </span>
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${CARD} mt-10 text-center`}>
        <h2 className={H2}>Siap mulai?</h2>
        <p className="mt-1 text-sm text-[#5c4d42]">Chat kami di WhatsApp, tulis nama dan kota kamu. Kami jelaskan semuanya di sana.</p>
        <ResellerWhatsApp where="bottom" className="mt-4" />
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#f3d9c4] bg-white/95 p-3 backdrop-blur sm:hidden">
        <ResellerWhatsApp where="sticky" />
      </div>
    </div>
  );
}
