import type { Metadata } from 'next';
import Link from 'next/link';
import { ALL_ARTICLES, articlePath } from '@/lib/shop/articles';
import { shopBase } from '@/lib/shop/server';
import { playfair } from '../fonts';

export const metadata: Metadata = {
  title: 'Resep & Tips Masak Daging Marinasi',
  description: 'Resep olahan daging BBQ marinasi: nasi goreng, sambal matah, mantau isi daging, tumis buncis — plus cara masak di teflon dan cara menyimpannya.',
  alternates: { canonical: '/resep-tips' },
};

export default async function ArticlesPage() {
  const base = await shopBase();
  return (
    <div className={`${playfair.variable} max-w-3xl mx-auto flex flex-col gap-6 py-2`}>
      <h1 className="font-[family-name:var(--font-heading)] text-3xl sm:text-4xl font-bold text-[#3b1a0c]">Resep & Tips</h1>
      <p className="text-[#4b5563]">Resep olahan daging BBQ marinasi, plus cara memasak dan menyimpannya di rumah.</p>
      <ul className="flex flex-col gap-4">
        {ALL_ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link href={`${base}${articlePath(a)}`} className="flex gap-4 rounded-[20px] bg-white border border-[#f3f4f6] p-3 hover:shadow">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.image} alt={a.imageAlt} loading="lazy" className="w-28 h-28 sm:w-36 sm:h-36 object-cover rounded-2xl shrink-0" />
              <span className="flex flex-col gap-1 justify-center">
                {a.recipe && (
                  <span className="self-start rounded-full bg-[#fdf3ea] px-2.5 py-0.5 text-xs font-semibold text-[#9a3412]">
                    Resep · {a.recipe.meat === 'babi' ? 'Babi' : 'Sapi'}
                  </span>
                )}
                <span className="font-bold text-lg text-[#111827]">{a.title}</span>
                <span className="text-sm text-[#6b7280] line-clamp-3">{a.description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
