'use client';

import { useEffect, useRef, useState } from 'react';

export interface Photo {
  full: string;
  thumb: string;
  label: string;
}

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const fileName = (src: string) => {
  const name = src.split('/').pop() || 'foto';
  return `jentis-kitchen-${/\.(jpe?g|png|webp)$/i.test(name) ? name : `${name}.jpg`}`;
};

/**
 * Tap a photo to save it. A website cannot write into the phone gallery itself. iPhone: the share sheet with the
 * image, where "Save Image" puts it in Photos; Safari only opens it straight from the tap, so on iPhone the full
 * images are fetched in advance, one after another. Elsewhere (Android): a normal download, shown in the gallery
 * under Download.
 */
export default function PhotoGrid({ photos, tall = false }: { photos: Photo[]; /** 9:16 story pictures instead of squares. */ tall?: boolean }) {
  const files = useRef(new Map<string, File>());
  const [saved, setSaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isIOS() || !navigator.canShare) return;
    let stop = false;
    (async () => {
      for (const p of photos) {
        if (stop) return;
        try {
          const blob = await (await fetch(p.full)).blob();
          files.current.set(p.full, new File([blob], fileName(p.full), { type: blob.type || 'image/jpeg' }));
        } catch {
          // keep going: that photo falls back to a download
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [photos]);

  async function save(p: Photo) {
    const file = files.current.get(p.full);
    if (isIOS() && file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // share sheet closed
      }
    } else {
      const a = document.createElement('a');
      a.href = p.full;
      a.download = fileName(p.full);
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setSaved((s) => new Set(s).add(p.full));
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {photos.map((p) => (
        <button
          key={p.full}
          type="button"
          onClick={() => save(p)}
          className={`relative block overflow-hidden rounded-xl bg-[#fdf3ea] shadow-sm ${tall ? 'aspect-[9/16]' : 'aspect-square'}`}
          aria-label={`Simpan ${p.label}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.thumb} alt={p.label} loading="lazy" className="h-full w-full object-cover" />
          <span className={`absolute bottom-2 right-2 rounded-full px-2.5 py-1 text-xs font-semibold shadow ${saved.has(p.full) ? 'bg-[#25D366] text-white' : 'bg-white/90 text-[#9a3412]'}`}>
            {saved.has(p.full) ? 'Tersimpan ✓' : 'Simpan'}
          </span>
        </button>
      ))}
    </div>
  );
}
