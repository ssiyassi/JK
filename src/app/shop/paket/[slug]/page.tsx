import type { Metadata } from 'next';
import Link from 'next/link';
import { getDB } from '@/lib/server';
import { bundleOpensAt, bundleTotals, DAY_NAMES, getBundleBySlug, isBundleLive, openToday, weekdaysLabel, type Bundle } from '@/lib/shop/bundles';
import { formatRupiah } from '@/lib/shop/catalog';
import { loadCatalog } from '@/lib/shop/products';
import { shopBase } from '@/lib/shop/server';
import BundleBuilder from './BundleBuilder';
import { playfair } from '../../fonts';

export const dynamic = 'force-dynamic';

async function findBundle(slug: string) {
  const db = getDB();
  const [bundle, catalog] = await Promise.all([getBundleBySlug(db, slug).catch(() => null), loadCatalog(db)]);
  return bundle && isBundleLive(bundle, catalog, Date.now()) ? { bundle, catalog } : null;
}

/** A weekly bundle on one of its closed days (e.g. Paket Thursday–Sunday on a Monday): when it opens again. */
async function closedForToday(slug: string): Promise<{ bundle: Bundle; opens: number } | null> {
  const bundle = await getBundleBySlug(getDB(), slug).catch(() => null);
  const now = Date.now();
  if (!bundle || !bundle.active || !bundle.weekdays || openToday(bundle, now)) return null;
  const opens = bundleOpensAt(bundle, now);
  if (opens === null || (bundle.endsAt !== null && opens > bundle.endsAt)) return null;
  return { bundle, opens };
}

const opensText = (ms: number) => {
  const d = new Date(ms + 7 * 3600 * 1000);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getUTCMonth()];
  return `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${month}`;
};

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await findBundle((await props.params).slug);
  if (!found) return { title: 'Paket tidak tersedia', robots: { index: false } };
  const { bundle, catalog } = found;
  const { compareAt } = bundleTotals(bundle, catalog);
  const description = `${bundle.tagline || bundle.name}. ${formatRupiah(bundle.price)}${compareAt > bundle.price ? ` (hemat ${formatRupiah(compareAt - bundle.price)})` : ''}.`;
  return { title: bundle.name, description, alternates: { canonical: `/paket/${bundle.slug}` }, openGraph: { title: bundle.name, description, url: `/paket/${bundle.slug}` } };
}

/** Bundle page (Paket Hemat): the customer picks a product for every slot, then adds the bundle to the cart. */
export default async function BundlePage(props: { params: Promise<{ slug: string }> }) {
  const [found, base] = await Promise.all([findBundle((await props.params).slug), shopBase()]);
  if (!found) {
    const closed = await closedForToday((await props.params).slug);
    if (closed) {
      return (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
          <span className="rounded-full bg-[#fbbf24] px-3 py-1 text-xs font-extrabold text-[#3b1a0c]">PAKET HEMAT</span>
          <p className="text-xl font-bold text-[#111827]">{closed.bundle.name} buka lagi {opensText(closed.opens)}</p>
          <p className="text-[#6b7280]">Paket ini hanya ada {weekdaysLabel(closed.bundle.weekdays!)}. Sambil menunggu, semua menu tetap bisa dipesan.</p>
          <Link href={base || '/'} className="mt-2 rounded-xl bg-[#9a3412] px-5 py-3 font-bold text-white">
            Lihat menu
          </Link>
        </div>
      );
    }
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <p className="text-xl font-bold text-[#111827]">Paket ini sudah tidak tersedia</p>
        <p className="text-[#6b7280]">Lihat menu dan paket lain di halaman utama.</p>
        <Link href={base || '/'} className="mt-2 rounded-xl bg-[#9a3412] px-5 py-3 font-bold text-white">
          Lihat menu
        </Link>
      </div>
    );
  }
  return (
    <div className={playfair.variable}>
      <BundleBuilder bundle={found.bundle} />
    </div>
  );
}
