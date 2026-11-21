'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resizeImage } from '@/lib/client/resizeImage';
import type { PromoPhoto } from '@/lib/shop/promo-photos';

/** Website → Promo Photos: add or remove the photos resellers can save on /hadiah-reseller/foto. */
export default function PromoPhotosPanel({ photos, payday }: { photos: PromoPhoto[]; payday: { image: string; label: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function add(files: FileList) {
    setMessage(null);
    let added = 0;
    for (const [i, file] of [...files].entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const image = await resizeImage(file, { maxSize: 1600, quality: 0.8 });
        const thumb = await resizeImage(file, { maxSize: 480, square: true, quality: 0.72 });
        const res = await fetch('/api/website/promo-photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image, thumb }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to add photo');
        added++;
      } catch (e) {
        setMessage({ ok: false, text: `${file.name}: ${(e as Error).message}` });
      }
    }
    setBusy(null);
    if (added) setMessage({ ok: true, text: `${added} photo${added > 1 ? 's' : ''} added.` });
    router.refresh();
  }

  async function remove(p: PromoPhoto) {
    if (!confirm('Remove this photo from the reseller page?')) return;
    setBusy('Removing…');
    setMessage(null);
    try {
      const res = await fetch(`/api/website/promo-photos/${p.id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to remove photo');
      setMessage({ ok: true, text: 'Photo removed.' });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <label className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white cursor-pointer ${busy ? 'bg-gray-400 pointer-events-none' : 'bg-[#9a3412] hover:bg-[#7c2d12]'}`}>
        + Add photos
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files?.length && add(e.target.files)} />
      </label>
      <span className="ml-3 text-sm text-gray-600">{busy ?? 'You can pick several photos at once.'}</span>
      {message && (
        <p className={`mt-3 text-sm rounded-md px-3 py-2 ${message.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {message.text}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div className="relative rounded-xl overflow-hidden border-2 border-[#9a3412] aspect-square bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={payday.image} alt={payday.label} className="h-full w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 bg-[#9a3412] text-white text-xs font-semibold px-2 py-1.5">
            {payday.label} · always first, change it in Website → Payday
          </span>
        </div>
        {photos.map((p) => (
          <div key={p.id} className="relative rounded-xl overflow-hidden border border-gray-200 aspect-square bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.label} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              disabled={Boolean(busy)}
              className="absolute top-2 right-2 rounded-full bg-red-600 text-white text-xs font-semibold px-3 py-1.5 shadow disabled:bg-gray-400"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
