import type { Metadata } from 'next';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { AFFILIATE_COMMISSION, AFFILIATE_PAYOUT_TEXT } from '@/lib/shop/affiliate-text';
import { loadCatalog } from '@/lib/shop/products';
import { AREA_SERVED, jsonLdScript, SITE_URL } from '@/lib/shop/seo';
import { shopBase } from '@/lib/shop/server';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { playfair } from '../fonts';
import { DotPanel, PhotoCollage, ProductShowcase, rupiah, SectionTitle, shortRupiah } from '../collab/CollabParts';
import AffiliateForm from './AffiliateForm';
import FindLinkForm from './FindLinkForm';

// Public affiliate sign-up (jentiskitchen.id/affiliate, in the sitemap). Anyone can join and gets their link at once;
// sign-ups land in Website → Affiliates with a Telegram alert. Rules in src/lib/shop/affiliates.ts.

const TITLE = 'Program Affiliate — Komisi Rp10.000 per Box';
const DESCRIPTION =
  'Ajak teman belanja daging BBQ marinasi Jentis Kitchen lewat link kamu dan dapat Rp10.000 untuk setiap box, termasuk setiap kali mereka pesan lagi. Daftar gratis.';
const PREVIEW = '/shop/collab/preview.jpg';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/affiliate' },
  openGraph: { type: 'website', url: '/affiliate', title: `${TITLE} — Jentis Kitchen`, description: DESCRIPTION, images: [{ url: PREVIEW, width: 1200, height: 630, alt: 'Program affiliate Jentis Kitchen' }] },
  twitter: { card: 'summary_large_image', title: `${TITLE} — Jentis Kitchen`, description: DESCRIPTION, images: [PREVIEW] },
};

const commission = AFFILIATE_COMMISSION;

const STEPS = [
  ['Daftar.', 'Link kamu langsung jadi dan dikirim ke email.'],
  ['Bagikan link.', 'Ke teman, keluarga, grup WhatsApp, Instagram atau TikTok.'],
  ['Teman belanja.', 'Yang belanja pertama kali lewat link kamu jadi pelanggan kamu.'],
  ['Dapat komisi.', `Ditransfer ${AFFILIATE_PAYOUT_TEXT} ke rekening kamu.`],
];

const BENEFITS = [
  [`${rupiah(commission)} per box,`, 'tanpa batas jumlah.'],
  ['Komisi SELAMANYA:', 'setiap kali pelanggan kamu pesan lagi.'],
  ['Tanpa modal & stok.', 'Kami yang kirim ke pelanggan.'],
  ['Foto & testimoni siap pakai.', 'Kamu tinggal promosi.'],
];

function faq(welcome: { percent: number; cap: number }) {
  return [
    ['Apakah daftar affiliate berbayar?', 'Tidak, gratis. Kamu tidak perlu membeli atau menyimpan stok apa pun.'],
    ['Berapa komisinya?', `${rupiah(commission)} untuk setiap box yang dibeli pelanggan kamu, tanpa batas jumlah.`],
    [
      'Pesanan siapa yang dihitung untuk saya?',
      'Pelanggan baru yang belanja pertama kali lewat link kamu (dalam 30 hari setelah klik link). Setelah itu, setiap pesanan berikutnya dari pelanggan tersebut (akun, nomor HP, atau email yang sama) tetap dihitung untuk kamu, SELAMANYA.',
    ],
    [
      'Kalau teman saya sudah pernah belanja di Jentis Kitchen?',
      'Pelanggan yang sudah pernah belanja sebelumnya tidak dihitung. Komisi hanya untuk pelanggan baru yang kamu ajak.',
    ],
    ['Apakah pesanan saya sendiri dihitung?', 'Tidak. Pesanan dengan nomor WhatsApp kamu sendiri tidak mendapat komisi.'],
    ['Kapan komisi dibayar?', `Komisi direkap dan ditransfer ${AFFILIATE_PAYOUT_TEXT} ke rekening yang kamu daftarkan. Kamu bisa cek jumlahnya di halaman affiliate kamu.`],
    [
      'Di mana saya bisa lihat link dan komisi saya?',
      'Di halaman affiliate kamu. Link halaman itu kami kirim ke email kamu saat daftar. Lupa? Masukkan email kamu di kotak "Sudah daftar?" di halaman ini, kami kirim lagi.',
    ],
    [
      'Apa untungnya untuk teman saya?',
      `Pembelian pertama dapat diskon pelanggan baru ${welcome.percent}% (maks. ${rupiah(welcome.cap)}).`,
    ],
    ['Harus punya banyak followers?', 'Tidak. Cukup cerita ke teman, keluarga, atau tetangga juga bisa.'],
    ['Pengiriman ke mana saja?', `Saat ini kami mengirim ke ${AREA_SERVED.join(', ')}.`],
  ];
}

export default async function AffiliateLandingPage() {
  const db = getDB();
  const [rules, catalog, base] = await Promise.all([loadVoucherRules(db), loadCatalog(db), shopBase()]);
  const questions = faq(rules.WELCOME);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${SITE_URL}/affiliate`,
    mainEntity: questions.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <div className={`${playfair.variable} mx-auto max-w-5xl space-y-8 sm:space-y-10 text-[#3b1a0c]`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <DotPanel className="px-5 pt-6 pb-8 sm:px-10 sm:py-10">
        <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#f6dcc4]" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-block -rotate-2 max-sm:rotate-0 rounded-full bg-[#9a3412] px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#5a1f0a]">Gratis daftar 🔗</p>
            <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.25em] text-[#9a3412]">Program affiliate</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-[38px] leading-[1.05] font-bold sm:text-6xl">
              Ajak teman, dapat <span className="italic text-[#9a3412]">{rupiah(commission)} per box</span>
            </h1>
            <p className="mt-3 text-lg leading-7 text-[#5c4d42]">
              Bagikan link kamu. Setiap teman yang belanja pertama kali lewat link kamu jadi pelanggan kamu:{' '}
              <b className="text-[#3b1a0c]">setiap kali mereka pesan lagi, kamu tetap dapat komisi. SELAMANYA.</b>
            </p>
            {/* Phones: three straight photos (approved design; the owner does not like tilted pictures). */}
            <div className="sm:hidden mt-4 flex gap-2">
              {['grill', 'plate', 'stack'].map((n) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={n} src={`/shop/collab/${n}.jpg`} alt="" className="h-[92px] min-w-0 flex-1 rounded-[14px] border-[3px] border-white object-cover shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]" />
              ))}
            </div>
            <a href="#daftar" className="max-sm:block max-sm:text-center mt-5 inline-block rounded-full bg-[#9a3412] px-7 py-3.5 text-lg font-bold text-white shadow-[0_5px_0_#5a1f0a] hover:bg-[#7c2d12]">
              Daftar sekarang
            </a>
          </div>
          <div className="max-sm:hidden">
          <PhotoCollage
            stickerTop={
              <>
                <span className="text-[11px] font-bold tracking-wider">KOMISI</span>
                <span className="font-[family-name:var(--font-heading)] text-3xl font-bold leading-none">{shortRupiah(commission)}</span>
                <span className="text-[11px] font-bold">setiap box</span>
              </>
            }
            stickerBottom={
              <>
                <span className="text-[15px] font-extrabold leading-none tracking-tight">SELAMANYA</span>
                <span className="text-xs font-bold leading-4">
                  tiap teman
                  <br />
                  pesan lagi
                </span>
              </>
            }
          />
          </div>
        </div>
      </DotPanel>

      {/* Phones (app layout, owner 2026-11-12): three facts as small black labels with the brown value under them, and
          an example sum with 25 friends. */}
      <section className="sm:hidden grid grid-cols-3 gap-2">
        {[
          ['Komisi setiap box', rupiah(commission)],
          ['Dapat komisi', 'SELAMANYA'],
          ['Komisi ditransfer', 'MINGGUAN'],
        ].map(([label, value]) => (
          <div key={label} className="flex min-h-[74px] flex-col items-center justify-between rounded-2xl bg-white px-1.5 py-3 text-center shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
            <span className="text-[11px] font-semibold leading-tight text-[#111827]">{label}</span>
            <b className="text-[15px] font-extrabold tracking-[0.2px] text-[#9a3412]">{value}</b>
          </div>
        ))}
      </section>
      <section className="sm:hidden rounded-[20px] bg-white p-3.5 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
        <b className="text-[#111827]">Contoh hitungan</b>
        <p className="text-xs text-[#6b7280]">Kalau 25 teman masing-masing pesan 2 box sebulan</p>
        <div className="mt-2.5 flex items-center justify-between gap-1 text-[11px] text-[#4b5563]">
          {[
            ['25', 'teman'],
            ['2 box', 'sebulan'],
            [`Rp${shortRupiah(commission)}`, 'per box'],
          ].map(([v, l], i) => (
            <span key={l} className="contents">
              {i > 0 && <span aria-hidden>×</span>}
              <span className="flex-1 whitespace-nowrap rounded-xl bg-[#faf9f6] px-1 py-2 text-center">
                <b className="block text-base text-[#111827]">{v}</b>
                {l}
              </span>
            </span>
          ))}
          <span aria-hidden>=</span>
          <span className="flex-1 whitespace-nowrap rounded-xl bg-[#ecfdf3] px-1 py-2 text-center text-[#15803d]">
            <b className="block text-base">Rp{shortRupiah(25 * 2 * commission)}</b>
            per bulan
          </span>
        </div>
      </section>

      <section id="sudah-daftar" className="scroll-mt-20 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#f1e7dd] sm:p-5">
        <p className="font-bold">Sudah daftar? Lihat link & komisi kamu</p>
        <p className="mb-3 text-sm text-[#5c4d42]">Masukkan email yang kamu daftarkan, kami kirim link halaman affiliate kamu.</p>
        <FindLinkForm />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd]">
          <SectionTitle kicker="Caranya">4 langkah gampang</SectionTitle>
          <ol className="-mt-1 space-y-2.5">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-3 text-[15px] leading-6">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#9a3412] text-xs font-bold text-white">{i + 1}</span>
                <span>
                  <b>{title}</b> <span className="text-[#5c4d42]">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd]">
          <SectionTitle kicker="Keuntungan">Kenapa ikut?</SectionTitle>
          <ul className="-mt-1 space-y-2.5">
            {BENEFITS.map(([title, text]) => (
              <li key={title} className="flex gap-3 text-[15px] leading-6">
                <span className="mt-0.5 font-bold text-[#15803d]" aria-hidden>
                  ✓
                </span>
                <span>
                  <b>{title}</b> <span className="text-[#5c4d42]">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ProductShowcase title="Yang akan kamu rekomendasikan" products={catalog.filter((p) => p.visible)} base={base} welcome={rules.WELCOME} />

      <section id="daftar" className="scroll-mt-20 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-8">
        <SectionTitle kicker="Gratis">Daftar jadi affiliate</SectionTitle>
        <p className="-mt-2 mb-5 leading-7 text-[#5c4d42]">Setelah daftar, link dan foto promosi kamu langsung muncul.</p>
        <AffiliateForm />
      </section>

      <section>
        <SectionTitle kicker="FAQ">Pertanyaan yang sering ditanya</SectionTitle>
        <div className="space-y-3">
          {questions.map(([q, a]) => (
            <details key={q} className="group rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#f1e7dd]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {q}
                <span className="text-[#9a3412] transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-2 text-[15px] leading-7 text-[#5c4d42]">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <p className="text-sm text-[#5c4d42]">Ada pertanyaan lain?</p>
        <a href="#sudah-daftar" className="mb-2 text-sm font-semibold text-[#9a3412] underline">
          Sudah daftar? Kirim ulang link saya
        </a>
        <a
          href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent('Halo Jentis Kitchen, saya mau tanya soal program affiliate.')}`}
          className="rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white"
        >
          Chat kami di WhatsApp
        </a>
      </div>
    </div>
  );
}
