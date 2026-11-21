import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDB } from '@/lib/server';
import { CONTACT_WHATSAPP } from '@/lib/shop/catalog';
import { collabClosed, collabShopLink, getCollabBySlug, PAYOUT_TEXT, publicCollab } from '@/lib/shop/collabs';
import { loadCatalog } from '@/lib/shop/products';
import { emailLinks, shopBase } from '@/lib/shop/server';
import { loadVoucherRules } from '@/lib/shop/vouchers';
import { MONTHS_ID } from '@/lib/core/time';
import CopyButton from '../../_components/CopyButton';
import { playfair } from '../../fonts';
import { Bullets, Card, DotPanel, PhotoCollage, ProductShowcase, rupiah, SectionTitle, shortRupiah } from '../CollabParts';
import AcceptForm from './AcceptForm';

// An influencer's private offer page (Website → Collabs). Kept out of Google (noindex, random ending in the address).
// Shows their own shop link (utm_campaign = their link name) and the voucher code they will get — the voucher itself
// is created by the owner after they accept here. Never shows the acceptance details (address, bank) back.

type Props = { params: Promise<{ slug: string }> };

const PREVIEW = '/shop/collab/preview.jpg';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collab = await getCollabBySlug(getDB(), slug);
  const title = collab ? `Penawaran collab untuk ${collab.name}` : 'Kerja sama Jentis Kitchen';
  const description = 'Yuk, collab bareng Jentis Kitchen! Produk gratis untuk direview dan komisi untuk setiap box yang terjual.';
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: [{ url: PREVIEW, width: 1200, height: 630, alt: 'Yuk, collab bareng Jentis Kitchen' }] },
    twitter: { card: 'summary_large_image', title, description, images: [PREVIEW] },
  };
}

const dayText = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
};

/** The page's data, read once per request (outside the component, so rendering stays pure). */
async function loadOffer(slug: string) {
  const db = getDB();
  const found = await getCollabBySlug(db, slug);
  if (!found) return null;
  const [rules, catalog, base] = await Promise.all([loadVoucherRules(db), loadCatalog(db), shopBase()]);
  return { c: publicCollab(found), welcome: rules.WELCOME, products: catalog.filter((p) => p.visible), base, closed: collabClosed(found, Date.now()) };
}

export default async function CollabOfferPage({ params }: Props) {
  const { slug } = await params;
  const offer = await loadOffer(slug);
  if (!offer) notFound();
  const { c, welcome, products, base, closed } = offer;
  const link = collabShopLink(c, emailLinks().shopUrl);
  const accepted = c.acceptedAt !== null;
  const exampleBoxes = 20;

  return (
    <div className={`${playfair.variable} mx-auto max-w-5xl space-y-6 sm:space-y-8 text-[#3b1a0c]`}>
      <DotPanel className="px-5 pt-6 pb-8 sm:px-10 sm:py-10">
        <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#f6dcc4]" />
        <div className="relative grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="inline-block rotate-3 rounded-full bg-[#9a3412] px-4 py-2 text-sm font-extrabold text-white shadow-[0_4px_0_#5a1f0a]">Yuk, collab! 🤝</p>
            <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.25em] text-[#9a3412]">Penawaran kerja sama</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-[44px] leading-[1.02] font-bold sm:text-6xl">
              Halo, <span className="italic text-[#9a3412]">{c.name}!</span>
            </h1>
            <p className="mt-3 text-lg leading-7 text-[#5c4d42]">
              Kami dari <b className="text-[#3b1a0c]">Jentis Kitchen</b> ingin mengajak kamu collab: kamu cobain daging marinasi kami, bagikan ke
              followers kamu, dan dapat komisi dari setiap box yang mereka beli.
            </p>
            <p className="mt-2 font-[family-name:var(--font-brand)] text-4xl sm:text-5xl leading-none text-[#7c2d12]">masak, cicip, cuan bareng</p>
          </div>
          <PhotoCollage
            stickerTop={
              <>
                <span className="text-[11px] font-bold tracking-wider">KOMISI</span>
                <span className="font-[family-name:var(--font-heading)] text-3xl font-bold leading-none">{shortRupiah(c.commissionPerBox)}</span>
                <span className="text-[11px] font-bold">setiap box</span>
              </>
            }
            stickerBottom={
              <>
                <span className="text-lg font-extrabold leading-none">Produk</span>
                <span className="text-xs font-bold leading-4">gratis buat
                  <br />
                  kamu!
                </span>
              </>
            }
          />
        </div>
      </DotPanel>

      <ProductShowcase
        title="Yang akan kamu promosikan"
        products={products}
        base={base}
        welcome={welcome}
        note="Harga ini untuk info kamu. Di konten tidak perlu menyebutkan harga ya, followers bisa melihatnya di website."
      />

      <section>
        <SectionTitle kicker="Untuk kamu">Yang kamu dapat</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card icon="🎁" title="Produk gratis">
            {c.freeProducts}, kami kirim ke alamat kamu untuk dicoba dan direview.
          </Card>
          <Card icon="💸" title={`Komisi ${rupiah(c.commissionPerBox)} per box`}>
            Untuk setiap box yang dibeli followers kamu, tanpa batas jumlah. Ditransfer {PAYOUT_TEXT}.
          </Card>
          <Card icon="🔗" title="Link & kode khusus">
            Link belanja atas nama kamu dan kode voucher <b className="font-mono">{c.voucherCode}</b> untuk followers kamu.
          </Card>
        </div>
      </section>

      <section className="rounded-3xl bg-[#7c2d12] p-5 text-[#fdf3ea] sm:p-8">
        <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-[#f6dcc4]">Punya kamu</p>
        <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold sm:text-3xl">Link & kode kamu</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-[1.6fr_1fr]">
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm text-[#f6dcc4]">Link belanja kamu (taruh di bio & stiker link Story)</p>
            <p className="mt-2 break-all rounded-xl bg-white px-3 py-3 font-mono text-sm text-[#3b1a0c]">{link}</p>
            <CopyButton text={link} label="Salin link" className="mt-3 w-full rounded-full bg-[#f4b740] px-5 py-3 font-bold text-[#3b1a0c] hover:bg-[#f7c55e]" />
          </div>
          <div className="rounded-2xl bg-white/10 p-4">
            <p className="text-sm text-[#f6dcc4]">Kode voucher kamu</p>
            <p className="mt-2 rounded-xl border-2 border-dashed border-[#f4b740] px-3 py-2 text-center font-mono text-3xl font-bold tracking-widest text-white">{c.voucherCode}</p>
            <CopyButton text={c.voucherCode} label="Salin kode" className="mt-3 w-full rounded-full border-2 border-[#f4b740] px-5 py-2.5 font-bold text-[#f4b740] hover:bg-white/10" />
            <p className="mt-2 text-xs leading-5 text-[#f6dcc4]">Kode aktif setelah kamu setuju dan kami konfirmasi.</p>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle kicker="Untuk followers kamu">Diskon untuk followers</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#fdf3ea] p-5">
            <p className="text-sm font-bold text-[#9a3412]">Pembelian pertama</p>
            <p className="font-[family-name:var(--font-heading)] text-4xl font-bold">
              {welcome.percent}% <span className="font-[family-name:var(--font-inter)] text-sm font-medium text-[#5c4d42]">maks. {rupiah(welcome.cap)}</span>
            </p>
            <p className="mt-1 text-sm leading-6 text-[#5c4d42]">Klik link kamu lalu belanja: diskon pelanggan baru langsung terpasang otomatis.</p>
          </div>
          <div className="rounded-2xl bg-[#fdf3ea] p-5">
            <p className="text-sm font-bold text-[#9a3412]">Pembelian berikutnya</p>
            <p className="font-[family-name:var(--font-heading)] text-4xl font-bold">
              {c.codePercent}% <span className="font-[family-name:var(--font-inter)] text-sm font-medium text-[#5c4d42]">maks. {rupiah(c.codeCap)}</span>
            </p>
            <p className="mt-1 text-sm leading-6 text-[#5c4d42]">
              Pakai kode <b className="font-mono text-[#3b1a0c]">{c.voucherCode}</b> di halaman checkout.
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#8a7a6d]">Diskon berlaku untuk harga produk (tidak termasuk ongkos kirim). Satu pesanan hanya bisa memakai satu diskon.</p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-7">
          <SectionTitle kicker="Komisi">Cara komisi dihitung</SectionTitle>
          <Bullets
            items={[
              <>
                <b>Pembelian pertama:</b> follower masuk lewat link kamu dan pesan dalam 30 hari setelah klik.
              </>,
              <>
                <b>Pembelian berikutnya:</b> follower memakai kode <b className="font-mono">{c.voucherCode}</b>.
              </>,
              <>Dihitung dari pesanan yang sudah dibayar dan tidak dibatalkan.</>,
              <>
                Rekap dan transfer komisi <b>{PAYOUT_TEXT}</b>.
              </>,
            ]}
          />
          <p className="mt-4 rounded-2xl bg-[#fdf3ea] p-4 text-sm leading-6">
            <b>Contoh:</b> 10 followers masing-masing beli 2 box = {exampleBoxes} box × {rupiah(c.commissionPerBox)} ={' '}
            <b className="text-[#9a3412]">{rupiah(exampleBoxes * c.commissionPerBox)}</b>
          </p>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-7">
          <SectionTitle kicker="Konten">Yang kami harapkan</SectionTitle>
          <Bullets
            items={[
              <>
                Dalam <b>{c.contentDays} hari</b> setelah produk diterima, posting minimal <b>{c.minReels} video Reels{c.platform === 'tiktok' ? ' / TikTok' : ''}</b>
                {c.minStories > 0 && (
                  <>
                    {' '}dan <b>{c.minStories} Story</b> dengan stiker link
                  </>
                )}
                .
              </>,
              <>
                Selama masa kerja sama: <b>{dayText(c.startDate)} – {dayText(c.endDate)}</b>.
              </>,
              <>Tag @jentis.kitchen dan sebutkan kode voucher kamu di caption.</>,
              <>Pasang link kamu di bio selama masa kerja sama (jika memungkinkan).</>,
            ]}
          />
        </div>
      </section>

      <DotPanel className="p-5 sm:p-7">
        <div className="relative grid gap-6 md:grid-cols-2">
          <div>
            <p className="font-bold text-[#3b1a0c]">✨ Ide yang bisa ditonjolkan</p>
            <div className="mt-2">
              <Bullets
                items={[
                  'Rasa dan tekstur dagingnya saat dimasak dan dicicipi.',
                  'Momen masak atau grill di rumah bareng keluarga dan teman.',
                  'Praktis: dari freezer, langsung masak, siap makan.',
                  'Full daging, lebih nikmat dari AYCE.',
                ]}
              />
            </div>
          </div>
          <div>
            <p className="font-bold text-[#3b1a0c]">🙏 Mohon tidak menyebutkan</p>
            <div className="mt-2">
              <Bullets items={['Harga produk.', 'Jenis daging. Cukup sebut rasanya: Manis atau Asin Gurih.', 'Gratis ongkir.']} />
            </div>
            <p className="mt-2 text-xs text-[#8a7a6d]">Detail tersebut sudah ada di website setelah followers klik link kamu.</p>
          </div>
        </div>
      </DotPanel>

      <section id="setuju" className="scroll-mt-20 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[#f1e7dd] sm:p-8">
        {accepted ? (
          <div className="text-center">
            <p className="text-5xl" aria-hidden>
              🎉
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-bold">Terima kasih, {c.name}!</h2>
            <p className="mx-auto mt-2 max-w-lg text-[#5c4d42] leading-7">
              Kamu sudah setuju collab. Kami segera mengirim produk ke alamat kamu dan mengaktifkan kode <b className="font-mono">{c.voucherCode}</b>. Sampai
              jumpa di konten kamu!
            </p>
          </div>
        ) : closed ? (
          <div className="text-center">
            <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Penawaran ini sudah tidak berlaku</h2>
            <p className="mt-2 text-[#5c4d42]">Masih tertarik? Hubungi kami lewat WhatsApp ya.</p>
          </div>
        ) : (
          <>
            <SectionTitle kicker="Tertarik?">Ayo collab!</SectionTitle>
            <p className="-mt-2 mb-5 text-[#5c4d42] leading-7">
              Isi data di bawah supaya kami bisa mengirim produk dan mentransfer komisi kamu. Data ini hanya untuk kami, tidak ditampilkan di mana pun.
            </p>
            <AcceptForm slug={c.slug} />
          </>
        )}
      </section>

      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <p className="text-sm text-[#5c4d42]">Ada pertanyaan dulu?</p>
        <a
          href={`https://wa.me/${CONTACT_WHATSAPP}?text=${encodeURIComponent(`Halo Jentis Kitchen, saya ${c.name}. Saya mau tanya soal penawaran collab.`)}`}
          className="rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white"
        >
          Chat kami di WhatsApp
        </a>
      </div>
    </div>
  );
}
