import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { affiliateCommissions, affiliateLink, affiliatePageLink, AFFILIATE_PAYOUT_TEXT, getAffiliateBySlug, maskAccount } from '@/lib/shop/affiliates';
import { emailLinks } from '@/lib/shop/server';
import { playfair } from '../../fonts';
import { Bullets, DotPanel, rupiah, SectionTitle } from '../../collab/CollabParts';
import PhotoGrid, { type Photo } from '../../hadiah-reseller/foto/PhotoGrid';
import ShareBox from './ShareBox';

// An affiliate's own page (jentiskitchen.id/affiliate/<slug>, not in Google): their link, share buttons, what they
// earned, and product photos to post. Opened right after signing up.

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ baru?: string }> };

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Halaman Affiliate Saya',
  robots: { index: false, follow: false },
};

// Ready-made 9:16 stories with real customer chats (marketing/creatives/2026-11-affiliate, templates in
// marketing/creatives/templates/affiliate): no price, no meat type, a space at the bottom for their link sticker.
const TESTIMONIALS: Photo[] = Array.from({ length: 5 }, (_, i) => ({
  full: `/shop/affiliate/testimoni-${i + 1}.jpg`,
  thumb: `/shop/affiliate/testimoni-${i + 1}-thumb.jpg`,
  label: `Testimoni pelanggan ${i + 1}`,
}));

// The 10 product photos (no prices on them) that resellers also get.
const PHOTOS: Photo[] = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { full: `/shop/reseller/foto/foto-${n}.jpg`, thumb: `/shop/reseller/foto/foto-${n}-thumb.jpg`, label: `Foto produk ${i + 1}` };
});

const DATE = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
const boxes = (n: number) => `${n.toLocaleString('id-ID')} box`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#f1e7dd]">
      <p className="text-xs font-bold uppercase tracking-wider text-[#9a3412]">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-heading)] text-2xl font-bold">{value}</p>
      {sub && <p className="text-sm text-[#5c4d42]">{sub}</p>}
    </div>
  );
}

export default async function AffiliatePage({ params, searchParams }: Props) {
  const [{ slug }, { baru }] = await Promise.all([params, searchParams]);
  const db = getDB();
  const affiliate = await getAffiliateBySlug(db, slug);
  if (!affiliate) notFound();
  const shopUrl = emailLinks().shopUrl;
  const link = affiliateLink(affiliate, shopUrl);
  const report = await affiliateCommissions(db, [affiliate], Date.now());
  const r = report.affiliates[0];
  const firstName = affiliate.name.split(/\s+/)[0];
  const message = `Hai! Aku mau rekomendasiin daging BBQ marinasi dari Jentis Kitchen 😋 Tinggal panggang, rasanya enak banget dan praktis buat makan bareng keluarga.\n\nPesan di sini ya: ${link}`;

  if (affiliate.disabledAt !== null) {
    return (
      <div className={`${playfair.variable} mx-auto max-w-xl rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-[#f1e7dd]`}>
        <p className="font-[family-name:var(--font-heading)] text-2xl font-bold text-[#3b1a0c]">Link affiliate ini sudah tidak aktif</p>
        <p className="mt-2 text-[#5c4d42]">Silakan hubungi kami lewat WhatsApp kalau ada pertanyaan.</p>
        <a href={`https://wa.me/${CONTACT_WHATSAPP}`} className="mt-4 inline-block rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white">
          Chat kami di WhatsApp
        </a>
      </div>
    );
  }

  return (
    <div className={`${playfair.variable} mx-auto max-w-3xl space-y-8 text-[#3b1a0c]`}>
      <DotPanel className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="relative">
          {baru && <p className="mb-3 inline-block rounded-full bg-[#25D366] px-4 py-1.5 text-sm font-bold text-white">🎉 Pendaftaran berhasil!</p>}
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold sm:text-4xl">Halo, {firstName}! 👋</h1>
          <p className="mt-2 mb-5 leading-7 text-[#5c4d42]">
            Ini link affiliate kamu. Teman yang belanja pertama kali lewat link ini jadi pelanggan kamu, dan kamu dapat{' '}
            <b className="text-[#3b1a0c]">{rupiah(affiliate.commissionPerBox)} untuk setiap box</b> yang mereka beli, sekarang dan setiap kali mereka pesan lagi. SELAMANYA.
          </p>
          <ShareBox link={link} message={message} slug={slug} />
        </div>
      </DotPanel>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[15px] leading-6">
        <p className="font-bold">📌 Simpan halaman ini</p>
        <p className="text-[#5c4d42]">
          Di sini kamu bisa cek komisi kapan saja. Link halaman ini juga sudah kami kirim ke email kamu ({affiliate.email}). Lupa? Masukkan email kamu
          di jentiskitchen.id/affiliate, kami kirim lagi.
        </p>
        <p className="mt-1 break-all font-mono text-sm text-[#7c2d12]">{affiliatePageLink(affiliate, shopUrl)}</p>
      </section>

      <section>
        <SectionTitle kicker="Komisi">Hasil kamu</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pelanggan" value={String(r.customers)} sub="lewat link kamu" />
          <Stat label="Minggu ini" value={rupiah(r.thisWeek.commission)} sub={boxes(r.thisWeek.boxes)} />
          <Stat label="Minggu lalu" value={rupiah(r.lastWeek.commission)} sub={boxes(r.lastWeek.boxes)} />
          <Stat label="Total" value={rupiah(r.total.commission)} sub={boxes(r.total.boxes)} />
        </div>
        <p className="mt-3 text-sm text-[#5c4d42]">
          Ditransfer {AFFILIATE_PAYOUT_TEXT} ke {affiliate.bank} {maskAccount(affiliate.accountNumber)} a/n {affiliate.accountName}. Hanya pesanan yang sudah dibayar
          yang dihitung.
        </p>
        {r.orders.length > 0 && (
          <ul className="mt-4 divide-y divide-[#f1e7dd] rounded-2xl bg-white shadow-sm ring-1 ring-[#f1e7dd]">
            {r.orders.slice(0, 20).map((o) => (
              <li key={o.orderRowId} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                <span>
                  {DATE.format(o.paidAt)}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${o.kind === 'FIRST' ? 'bg-green-100 text-green-800' : 'bg-[#fdf3ea] text-[#9a3412]'}`}>
                    {o.kind === 'FIRST' ? 'Pelanggan baru' : 'Pesan lagi'}
                  </span>
                </span>
                <span className="text-right">
                  {boxes(o.boxes)} · <b>{rupiah(o.commission)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle kicker="Siap posting">Testimoni pelanggan</SectionTitle>
        <p className="-mt-2 mb-4 text-[#5c4d42]">
          Chat asli pelanggan, ukuran story (9:16). Simpan, posting di story Instagram atau status WhatsApp, lalu tempel link kamu di kotak bawahnya
          (Instagram: stiker &quot;Link&quot;; WhatsApp: tulis link di keterangan).
        </p>
        <PhotoGrid photos={TESTIMONIALS} tall />
      </section>

      <section>
        <SectionTitle kicker="Untuk promosi">Foto produk</SectionTitle>
        <p className="-mt-2 mb-4 text-[#5c4d42]">Ketuk foto untuk menyimpan ke galeri, lalu posting di status WhatsApp, Instagram atau TikTok bersama link kamu.</p>
        <PhotoGrid photos={PHOTOS} />
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-6">
        <SectionTitle kicker="Tips">Biar makin banyak yang beli</SectionTitle>
        <Bullets
          items={[
            'Ceritakan pengalaman kamu sendiri: praktis, tinggal panggang, enak untuk makan bareng keluarga.',
            'Pasang link kamu di bio Instagram / TikTok dan di status WhatsApp.',
            'Sebut rasanya saja (Manis atau Asin Gurih), tidak perlu menyebut harga atau promo, karena bisa berubah. Teman kamu bisa lihat semuanya di link.',
            'Teman baru dapat diskon pelanggan baru di pembelian pertama.',
          ]}
        />
      </section>

      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <p className="text-sm text-[#5c4d42]">Ada pertanyaan atau mau ganti rekening?</p>
        <a
          href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(`Halo Jentis Kitchen, saya affiliate ${affiliate.name} (${affiliate.code}).`)}`}
          className="rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white"
        >
          Chat kami di WhatsApp
        </a>
      </div>
    </div>
  );
}
