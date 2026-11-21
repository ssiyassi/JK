import type { Metadata } from 'next';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { COLLAB_DEFAULTS, PAYOUT_TEXT } from '@/lib/shop/collabs';
import { loadCatalog } from '@/lib/shop/products';
import { AREA_SERVED, jsonLdScript, SITE_URL } from '@/lib/shop/seo';
import { shopBase } from '@/lib/shop/server';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { playfair } from '../fonts';
import { Bullets, Card, DotPanel, PhotoCollage, ProductShowcase, rupiah, SectionTitle, shortRupiah } from './CollabParts';
import ApplyForm from './ApplyForm';

// Public page for influencers (jentiskitchen.id/collab, in the sitemap): how the collab works and a sign-up form.
// Sign-ups land in Website → Collabs; the owner checks the profile and makes a private offer page for the ones they like.

const TITLE = 'Kerja Sama Influencer & Affiliate';
const DESCRIPTION =
  'Jadi partner Jentis Kitchen: dapatkan produk daging BBQ marinasi untuk direview dan komisi untuk setiap box yang dibeli followers kamu. Daftar gratis.';
const PREVIEW = '/shop/collab/preview.jpg';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/collab' },
  openGraph: { type: 'website', url: '/collab', title: `${TITLE} — Jentis Kitchen`, description: DESCRIPTION, images: [{ url: PREVIEW, width: 1200, height: 630, alt: 'Yuk, collab bareng Jentis Kitchen' }] },
  twitter: { card: 'summary_large_image', title: `${TITLE} — Jentis Kitchen`, description: DESCRIPTION, images: [PREVIEW] },
};

const commission = COLLAB_DEFAULTS.commissionPerBox;

const STEPS = [
  ['📝', 'Daftar', 'Isi formulir di bawah dengan akun Instagram atau TikTok kamu.'],
  ['👀', 'Kami cek profil', 'Kalau cocok, kami kirim penawaran kerja sama lewat WhatsApp.'],
  ['🎁', 'Coba produknya', 'Kami kirim produk ke rumah kamu untuk dimasak dan direview.'],
  ['💸', 'Bagikan & dapat komisi', `Bagikan link dan kode khusus kamu, dapat ${rupiah(commission)} untuk setiap box.`],
];

function faq(welcome: { percent: number; cap: number }) {
  return [
    ['Apakah daftar collab berbayar?', 'Tidak, daftar gratis. Kamu tidak perlu membeli apa pun.'],
    [
      'Berapa komisinya?',
      `${rupiah(commission)} untuk setiap box yang dibeli followers kamu, tanpa batas jumlah. Komisi direkap dan ditransfer ${PAYOUT_TEXT}.`,
    ],
    [
      'Bagaimana pesanan followers dihitung untuk saya?',
      'Pembelian pertama dihitung dari link khusus kamu (dalam 30 hari setelah klik). Pembelian berikutnya dihitung dari kode voucher khusus kamu.',
    ],
    [
      'Apa untungnya untuk followers saya?',
      `Pembelian pertama dapat diskon pelanggan baru ${welcome.percent}% (maks. ${rupiah(welcome.cap)}). Setelah itu mereka bisa pakai kode voucher kamu.`,
    ],
    ['Berapa minimal followers?', 'Tidak ada angka pasti. Kami melihat kecocokan konten dan interaksi dengan followers, bukan hanya jumlahnya.'],
    ['Pengiriman ke mana saja?', `Saat ini kami mengirim ke ${AREA_SERVED.join(', ')}.`],
  ];
}

export default async function CollabLandingPage() {
  const db = getDB();
  const [rules, catalog, base] = await Promise.all([loadVoucherRules(db), loadCatalog(db), shopBase()]);
  const questions = faq(rules.WELCOME);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: `${SITE_URL}/collab`,
    mainEntity: questions.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <div className={`${playfair.variable} mx-auto max-w-5xl space-y-8 sm:space-y-10 text-[#3b1a0c]`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <DotPanel className="px-5 pt-6 pb-8 sm:px-10 sm:py-10">
        <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#f6dcc4]" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-block rotate-3 rounded-full bg-[#9a3412] px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#5a1f0a]">Yuk, collab! 🤝</p>
            <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.25em] text-[#9a3412]">Kerja sama influencer</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-[40px] leading-[1.05] font-bold sm:text-6xl">
              Jadi partner <span className="italic text-[#9a3412]">Jentis Kitchen</span>
            </h1>
            <p className="mt-3 text-lg leading-7 text-[#5c4d42]">
              Suka masak, ngulik makanan, atau berbagi momen makan bareng keluarga? Cobain daging BBQ marinasi kami, bagikan ke followers kamu, dan dapat
              komisi dari setiap box yang terjual.
            </p>
            <p className="mt-2 font-[family-name:var(--font-brand)] text-4xl sm:text-5xl leading-none text-[#7c2d12]">masak, cicip, cuan bareng</p>
            <a href="#daftar" className="mt-5 inline-block rounded-full bg-[#9a3412] px-7 py-3.5 text-lg font-bold text-white shadow-[0_5px_0_#5a1f0a] hover:bg-[#7c2d12]">
              Daftar sekarang
            </a>
          </div>
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
                <span className="text-lg font-extrabold leading-none">Produk</span>
                <span className="text-xs font-bold leading-4">
                  gratis untuk
                  <br />
                  direview
                </span>
              </>
            }
          />
        </div>
      </DotPanel>

      <ProductShowcase title="Yang akan kamu promosikan" products={catalog.filter((p) => p.visible)} base={base} welcome={rules.WELCOME} />

      <section>
        <SectionTitle kicker="Caranya">4 langkah gampang</SectionTitle>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title} className="relative rounded-2xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd]">
              <span className="absolute right-4 top-3 font-[family-name:var(--font-heading)] text-4xl font-bold text-[#f1e7dd]">{i + 1}</span>
              <p className="text-3xl" aria-hidden>
                {icon}
              </p>
              <p className="mt-2 font-bold">{title}</p>
              <p className="mt-1 text-sm leading-6 text-[#5c4d42]">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle kicker="Keuntungan">Yang kamu dan followers dapat</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card icon="💸" title={`Komisi ${rupiah(commission)} per box`}>
            Untuk setiap box yang dibeli followers kamu, tanpa batas. Ditransfer {PAYOUT_TEXT}.
          </Card>
          <Card icon="🔗" title="Link & kode khusus">
            Link belanja atas nama kamu dan kode voucher khusus untuk followers kamu.
          </Card>
          <Card icon="🏷️" title={`Diskon ${rules.WELCOME.percent}% untuk followers`}>
            Pembelian pertama dapat diskon pelanggan baru {rules.WELCOME.percent}% (maks. {rupiah(rules.WELCOME.cap)}), lalu bisa pakai kode kamu.
          </Card>
        </div>
      </section>

      <DotPanel className="p-5 sm:p-8">
        <div className="relative">
          <SectionTitle kicker="Siapa yang kami cari">Cocok untuk kamu yang…</SectionTitle>
          <Bullets
            items={[
              'Kreator makanan, resep, atau review kuliner.',
              'Kreator keluarga, ibu rumah tangga, atau lifestyle.',
              'Suka momen grill, BBQ, atau makan bareng di rumah.',
              `Tinggal di area pengiriman kami: ${AREA_SERVED.join(', ')}.`,
            ]}
          />
        </div>
      </DotPanel>

      <section id="daftar" className="scroll-mt-20 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-8">
        <SectionTitle kicker="Gratis">Daftar jadi partner</SectionTitle>
        <p className="-mt-2 mb-5 leading-7 text-[#5c4d42]">Isi data di bawah. Kalau profil kamu cocok, kami hubungi lewat WhatsApp dengan penawaran kerja sama.</p>
        <ApplyForm />
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
        <a
          href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent('Halo Jentis Kitchen, saya mau tanya soal kerja sama influencer.')}`}
          className="rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white"
        >
          Chat kami di WhatsApp
        </a>
      </div>
    </div>
  );
}
