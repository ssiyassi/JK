'use client';

import Link from 'next/link';
import { CONTACT_WHATSAPP, shopAsset, whatsappLink } from '@/lib/shop/catalog';
import { useShop } from './ShopProvider';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ICON: Record<string, React.ReactNode> = {
  gift: (
    <g {...stroke}>
      <path d="M4 11h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 7h18v4H3zM12 7v14" />
      <path d="M12 7S10.5 3 8 3.5 7 7 12 7zm0 0s1.5-4 4-3.5S17 7 12 7z" />
    </g>
  ),
  friends: (
    <g {...stroke}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </g>
  ),
  pan: (
    <g {...stroke}>
      <circle cx="10" cy="13" r="7" />
      <path d="m15.5 8.5 6-6M7 12c1-1.5 3-1.5 4 0" />
    </g>
  ),
  snow: <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" {...stroke} />,
  truck: (
    <g {...stroke}>
      <path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </g>
  ),
  help: (
    <g {...stroke}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2.2-2.4 3.9M12 17h.01" />
    </g>
  ),
  receipt: (
    <g {...stroke}>
      <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </g>
  ),
  wa: (
    <path
      fill="currentColor"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"
    />
  ),
};

const TONE: Record<string, string> = {
  brand: 'bg-[#fdf3ea] text-[#9a3412]',
  blue: 'bg-[#eff6ff] text-[#1d4ed8]',
  pink: 'bg-[#fdf2f8] text-[#be185d]',
  violet: 'bg-[#f5f3ff] text-[#6d28d9]',
  gold: 'bg-[#fef9c3] text-[#a16207]',
  slate: 'bg-[#f1f5f9] text-[#334155]',
  green: 'bg-[#ecfdf3] text-[#15803d]',
  wa: 'bg-[#dcfce7] text-[#16a34a]',
};

/** Phone homepage: shortcuts to the rest of the shop (owner, 2026-11-12: "embed more of the menu"). */
export default function QuickMenu({ className = '' }: { className?: string }) {
  const { href } = useShop();
  const items: { label: string; to: string; icon: string; tone: string; external?: boolean }[] = [
    { label: 'Voucher Saya', to: href('/voucher'), icon: 'gift', tone: 'brand' },
    { label: 'Ajak Teman', to: href('/voucher#ajak-teman'), icon: 'friends', tone: 'blue' },
    { label: 'Resep & Tips', to: href('/resep-tips'), icon: 'pan', tone: 'pink' },
    { label: 'Lacak Pesanan', to: href('/pesanan'), icon: 'receipt', tone: 'green' },
    { label: 'Cara Simpan', to: `${href('/')}#faq`, icon: 'snow', tone: 'violet' },
    { label: 'Ongkir & Area', to: `${href('/')}#faq`, icon: 'truck', tone: 'gold' },
    { label: 'Tanya Jawab', to: `${href('/')}#faq`, icon: 'help', tone: 'slate' },
    { label: 'Chat CS', to: whatsappLink(CONTACT_WHATSAPP, 'Halo Customer Care Jentis Kitchen, saya butuh bantuan.'), icon: 'wa', tone: 'wa', external: true },
  ];
  return (
    <nav aria-label="Menu cepat" className={`grid grid-cols-4 gap-y-3.5 rounded-[20px] bg-white px-1.5 pt-3.5 pb-2.5 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)] ${className}`}>
      {items.map((i) => {
        const inner = (
          <>
            <span className={`size-12 rounded-2xl grid place-items-center ${TONE[i.tone]}`}>
              <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
                {ICON[i.icon]}
              </svg>
            </span>
            {i.label}
          </>
        );
        const cls = 'flex flex-col items-center gap-1.5 text-center text-[11.5px] font-semibold leading-tight text-[#111827]';
        return i.external ? (
          <a key={i.label} href={i.to} target="_blank" rel="noreferrer" className={cls}>
            {inner}
          </a>
        ) : (
          <Link key={i.label} href={i.to} className={cls}>
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone homepage: real customer photos (the same ones affiliates share). */
export function Testimonials({ className = '' }: { className?: string }) {
  return (
    <section className={`flex flex-col gap-2.5 ${className}`}>
      <div>
        <h2 className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-[#3b1a0c]">Kata pelanggan</h2>
        <p className="text-xs text-[#4b5563]">Testimoni asli dari pembeli Jentis Kitchen</p>
      </div>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {[1, 2, 3, 4, 5].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={n}
            src={shopAsset(`/affiliate/testimoni-${n}-thumb.jpg`)}
            alt={`Testimoni pelanggan ${n}`}
            width={120}
            height={213}
            className="h-[213px] w-[120px] shrink-0 rounded-2xl bg-[#efe8e1] object-cover"
          />
        ))}
      </div>
    </section>
  );
}
