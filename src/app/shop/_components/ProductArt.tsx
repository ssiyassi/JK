'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/shop/catalog';

/** Product photo (cropped to fill). Falls back to a coloured tile with initials if the photo fails. */
/** `priority`: the main photo of a page (loads at once instead of when scrolled into view). */
export default function ProductArt({ item, className = '', priority = false }: { item: CatalogItem; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed || !item.image) {
    const initials = item.name
      .split(' ')
      .filter((w) => w !== 'Marinade')
      .map((w) => w[0])
      .join('')
      .slice(0, 2);
    return (
      <div className={`flex items-center justify-center select-none ${className}`} style={{ background: item.accent }} aria-hidden>
        <span className="text-white/90 font-bold text-2xl tracking-wider">{initials}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.image}
      alt={item.name}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-cover bg-[#f1e7dd] ${className}`}
    />
  );
}
