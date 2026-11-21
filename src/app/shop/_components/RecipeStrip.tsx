import Link from 'next/link';
import type { RecipeCard } from '@/lib/shop/articles';

/**
 * Small recipe cards (homepage under the products, product pages). Kept deliberately smaller than the product cards:
 * the products are what we sell, the recipes are ideas. A swipe row on phones, a grid from tablet up.
 */
export default function RecipeStrip({
  title,
  subtitle,
  cards,
  allHref,
}: {
  title: string;
  subtitle?: string;
  cards: (RecipeCard & { href: string })[];
  allHref: string;
}) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      {/* Phones: approved app design (Playfair title, "Semua" at the right, picture cards). */}
      <div className="sm:hidden flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-extrabold leading-7 text-[#3b1a0c]">{title}</h2>
          {subtitle && <p className="text-xs text-[#4b5563]">{subtitle.replace(/\.$/, '')}</p>}
        </div>
        <Link href={allHref} className="shrink-0 pb-0.5 text-[13px] font-semibold text-[#9a3412]">
          Semua
        </Link>
      </div>
      <ul className="sm:hidden -mx-4 px-4 flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-1 [scrollbar-width:none]">
        {cards.map((r) => (
          <li key={r.path} className="w-[200px] shrink-0 snap-start">
            <Link href={r.href} className="block overflow-hidden rounded-[18px] bg-white shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image} alt={r.imageAlt} loading="lazy" className="h-[130px] w-full object-cover" />
              <span className="block px-3 pt-2.5 pb-3">
                <span className="block text-sm font-bold leading-tight text-[#111827]">{r.title}</span>
                <span className="mt-1 flex gap-2 text-[11.5px] text-[#4b5563]">
                  <span>⏱ {r.minutes} mnt</span>
                  <span>🍽 {r.yield}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="max-sm:hidden flex flex-col gap-0.5">
        <h2 className="text-xl sm:text-2xl font-bold text-[#111827]">{title}</h2>
        <p className="text-sm text-[#6b7280]">
          {subtitle && <>{subtitle} </>}
          <Link href={allHref} className="whitespace-nowrap font-semibold text-[#9a3412] hover:underline">
            Semua resep →
          </Link>
        </p>
      </div>
      <ul className="max-sm:hidden -mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
        {cards.map((r) => (
          <li key={r.path} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <Link href={r.href} className="group flex h-full items-center gap-3 rounded-2xl bg-white border border-[#f3f4f6] p-2 pr-3 hover:shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image} alt={r.imageAlt} loading="lazy" className="size-16 sm:size-[72px] shrink-0 rounded-xl object-cover" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold text-sm leading-5 text-[#111827] group-hover:underline">{r.title}</span>
                <span className="text-xs text-[#6b7280]">
                  {r.meat === 'babi' ? 'Babi' : 'Sapi'} · {r.minutes} menit · {r.yield}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
