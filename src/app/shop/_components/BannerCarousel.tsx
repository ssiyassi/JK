'use client';

import { useEffect, useRef, useState } from 'react';
import type { Banner } from '@/lib/shop/catalog';

const AUTO_MS = 4500;

export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_MS);
    return () => clearInterval(timer);
  }, [count, index]);

  if (!count) return null;
  const go = (i: number) => setIndex(((i % count) + count) % count);

  return (
    // Two designs per banner: below 1024 px the mobile image at 39:25 (max 900 px wide, centred), from 1024 px the
    // desktop image at 2126:740 (≈2.87:1) across the full width. The browser downloads only the version it shows.
    <section
      className="relative aspect-[39/25] w-full max-w-[900px] mx-auto lg:aspect-[1063/370] lg:max-w-none overflow-hidden rounded-[24px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
      aria-roledescription="carousel"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
    >
      <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
        {banners.map((b, i) => (
          <div key={b.id} className="relative h-full w-full shrink-0" aria-hidden={i !== index}>
            <picture>
              <source media="(min-width: 1024px)" srcSet={b.image} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.mobileImage} alt="" className="absolute inset-0 size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
            </picture>
            {(b.title || b.badge || b.subtitle) && <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />}
            <div className="absolute left-5 bottom-8 sm:left-8 sm:bottom-10 lg:left-12 lg:bottom-12 right-5 flex flex-col items-start gap-2 lg:gap-4">
              {b.badge && (
                <span className="bg-[#9a3412] text-white text-[10px] lg:text-xs font-bold uppercase tracking-[0.6px] leading-4 px-3 py-1 rounded-full">
                  {b.badge}
                </span>
              )}
              {b.title && <h2 className="text-white font-bold text-[26px] leading-[30px] sm:text-4xl sm:leading-[40px] lg:text-5xl lg:leading-[48px] whitespace-pre-line">{b.title}</h2>}
              {b.subtitle && <p className="text-white/90 text-sm sm:text-lg lg:text-xl lg:leading-7">{b.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Banner ${i + 1}`}
              className={`size-2 rounded-full ${i === index ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
