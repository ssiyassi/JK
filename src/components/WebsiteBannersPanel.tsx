'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { resizeImage } from '@/lib/client/resizeImage';
import { BANNER_SIZES, type Banner } from '@/lib/shop/catalog';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const input = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#9a3412] focus:outline-none';

type Version = 'desktop' | 'mobile';

const VERSION_INFO: Record<Version, { label: string; where: string; aspect: string; previewWidth: string; maxSize: number }> = {
  desktop: { label: 'Desktop image', where: 'shown on computers (screens 1024 px and wider)', aspect: 'aspect-[1063/370]', previewWidth: 'w-full', maxSize: 2126 },
  mobile: { label: 'Mobile image', where: 'shown on phones and tablets', aspect: 'aspect-[39/25]', previewWidth: 'w-full max-w-xs', maxSize: 1600 },
};

/** Same look as the website banner (desktop or mobile version), so the admin sees what customers will see. */
function BannerPreview({ version, image, badge, title, subtitle }: { version: Version; image: string | null; badge: string; title: string; subtitle: string }) {
  const info = VERSION_INFO[version];
  return (
    <div className={`relative ${info.aspect} ${info.previewWidth} overflow-hidden rounded-xl bg-gray-200`}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {(title || badge || subtitle) && <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />}
      <div className="absolute left-4 bottom-3 right-4 flex flex-col items-start gap-1">
        {badge && <span className="bg-[#9a3412] text-white text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full">{badge}</span>}
        {title && <p className={`text-white font-bold whitespace-pre-line ${version === 'desktop' ? 'text-base leading-5' : 'text-lg leading-6'}`}>{title}</p>}
        {subtitle && <p className="text-white/90 text-[11px]">{subtitle}</p>}
      </div>
      {!image && <span className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Choose an image</span>}
    </div>
  );
}

/** One upload slot (desktop or mobile) with the exact size to design for and a warning when the shape is off. */
function ImageSlot({
  version,
  image,
  onImage,
  onError,
  text,
}: {
  version: Version;
  image: string | null;
  onImage: (dataUrl: string) => void;
  onError: (message: string) => void;
  text: { badge: string; title: string; subtitle: string };
}) {
  const info = VERSION_INFO[version];
  const size = BANNER_SIZES[version];
  const [warning, setWarning] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-semibold text-gray-900">{info.label}</p>
        <p className="text-xs text-gray-600">
          <b>
            {size.width} × {size.height} px
          </b>{' '}
          · ratio {size.ratioLabel} · {info.where}
        </p>
      </div>
      <BannerPreview version={version} image={image} {...text} />
      <input
        type="file"
        accept="image/*"
        className="block w-full text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const bitmap = await createImageBitmap(file);
            const want = size.width / size.height;
            const got = bitmap.width / bitmap.height;
            setWarning(
              Math.abs(got - want) / want > 0.05
                ? `This image is ${bitmap.width} × ${bitmap.height} px, a different shape from ${size.width} × ${size.height}. It will be cropped from the centre, as the preview shows.`
                : bitmap.width < size.width * 0.75
                  ? `This image is only ${bitmap.width} × ${bitmap.height} px and may look blurry. Best: ${size.width} × ${size.height} px.`
                  : null,
            );
            onImage(await resizeImage(file, { maxSize: info.maxSize }));
          } catch (err) {
            onError((err as Error).message);
          }
        }}
      />
      {warning && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">{warning}</p>}
    </div>
  );
}

interface BannerFormData {
  image: string | null;
  mobileImage: string | null;
  badge: string;
  title: string;
  subtitle: string;
  active: boolean;
}

function BannerForm({
  initial,
  submitLabel,
  onSubmit,
  extra,
}: {
  initial: BannerFormData;
  submitLabel: string;
  onSubmit: (data: BannerFormData) => Promise<void>;
  extra?: React.ReactNode;
}) {
  const [form, setForm] = useState({ badge: initial.badge, title: initial.title, subtitle: initial.subtitle, active: initial.active });
  const [newImage, setNewImage] = useState<string | null>(null);
  const [newMobileImage, setNewMobileImage] = useState<string | null>(null);
  const [slotKey, setSlotKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: 'badge' | 'title' | 'subtitle') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const onError = (text: string) => setMessage({ ok: false, text });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-5" key={slotKey}>
        <ImageSlot version="desktop" image={newImage ?? initial.image} onImage={setNewImage} onError={onError} text={form} />
        <ImageSlot version="mobile" image={newMobileImage ?? initial.mobileImage} onImage={setNewMobileImage} onError={onError} text={form} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Badge (optional)</span>
          <input className={input} value={form.badge} onChange={set('badge')} maxLength={30} placeholder="PROMO MINGGUAN" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Subtitle (optional)</span>
          <input className={input} value={form.subtitle} onChange={set('subtitle')} maxLength={140} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Title (optional, press Enter for a second line)</span>
          <textarea className={`${input} h-16 resize-none`} value={form.title} onChange={set('title')} maxLength={80} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="size-4" />
          Show on the website
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMessage(null);
            try {
              await onSubmit({ image: newImage, mobileImage: newMobileImage, ...form });
              setNewImage(null);
              setNewMobileImage(null);
              setSlotKey((k) => k + 1); // clear the file pickers and warnings
              setMessage({ ok: true, text: 'Saved. The website shows the change now.' });
            } catch (e) {
              setMessage({ ok: false, text: (e as Error).message });
            } finally {
              setBusy(false);
            }
          }}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {extra}
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </div>
  );
}

export default function WebsiteBannersPanel({ banners }: { banners: Banner[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activeCount = banners.filter((b) => b.active).length;

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {activeCount === 0 && (
        <p className="rounded-lg bg-[#f6f5f2] border border-[#ebe8e3] text-yellow-800 text-sm px-4 py-3">
          No banner is shown at the moment: the homepage starts directly with the products.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">{error}</p>}

      {adding ? (
        <section className="a-card p-5">
          <h2 className="font-semibold text-gray-900 mb-3">New banner</h2>
          <BannerForm
            key={formKey}
            initial={{ image: null, mobileImage: null, badge: '', title: '', subtitle: '', active: true }}
            submitLabel="Add banner"
            onSubmit={async (data) => {
              await send('/api/website/banners', 'POST', data);
              setAdding(false);
              setFormKey((k) => k + 1);
              router.refresh();
            }}
            extra={
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 rounded-lg border text-sm">
                Cancel
              </button>
            }
          />
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white text-sm font-medium">
          + Add banner
        </button>
      )}

      {banners.map((b, i) => (
        <section key={`${b.id}-${b.sortOrder}`} className={`a-card p-5 ${b.active ? '' : 'opacity-75'}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">
              Banner {i + 1} {b.active ? <span className="text-green-700 text-sm font-normal">· shown</span> : <span className="text-gray-500 text-sm font-normal">· hidden</span>}
            </h2>
            <div className="flex gap-2">
              <button type="button" disabled={i === 0} onClick={() => act(() => send(`/api/website/banners/${b.id}`, 'POST', { direction: 'up' }))} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30">
                ↑
              </button>
              <button type="button" disabled={i === banners.length - 1} onClick={() => act(() => send(`/api/website/banners/${b.id}`, 'POST', { direction: 'down' }))} className="px-3 py-1.5 rounded-lg border text-sm disabled:opacity-30">
                ↓
              </button>
            </div>
          </div>
          <BannerForm
            initial={{ image: b.image, mobileImage: b.mobileImage, badge: b.badge ?? '', title: b.title, subtitle: b.subtitle ?? '', active: b.active }}
            submitLabel="Save"
            onSubmit={async (data) => {
              await send(`/api/website/banners/${b.id}`, 'PATCH', data);
              router.refresh();
            }}
            extra={
              <button
                type="button"
                onClick={() => {
                  if (confirm('Delete this banner? This cannot be undone.')) act(() => send(`/api/website/banners/${b.id}`, 'DELETE'));
                }}
                className="ml-auto px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            }
          />
        </section>
      ))}
    </div>
  );
}
