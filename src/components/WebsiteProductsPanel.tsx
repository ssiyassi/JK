'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { resizeImage } from '@/lib/client/resizeImage';
import { DEFAULT_PRODUCT_LOOK, formatRupiah, type CatalogItem } from '@/lib/shop/catalog';

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

const BLANK: CatalogItem = {
  product: '',
  stockColumn: null,
  shortName: null,
  boxValue: 1,
  name: '',
  size: '',
  description: '',
  price: 0,
  compareAtPrice: null,
  image: '',
  accent: '',
  visible: true,
  sortOrder: 0,
};

/** Edits an existing product, or (item = BLANK, isNew) creates a new stock product. */
function ProductEditor({
  item,
  stock,
  deletable = false,
  first,
  last,
  isNew = false,
  onDone,
}: {
  item: CatalogItem;
  stock: number | null;
  deletable?: boolean; // website-only, or a stock product that was never stocked or ordered
  first?: boolean;
  last?: boolean;
  isNew?: boolean;
  onDone?: (savedMessage?: string) => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: item.name,
    shortName: item.shortName ?? '',
    boxValue: isNew ? '' : String(item.boxValue),
    initialStock: '',
    size: item.size,
    description: item.description,
    price: item.price ? String(item.price) : '',
    compareAtPrice: item.compareAtPrice ? String(item.compareAtPrice) : '',
    visible: item.visible,
  });
  const [image, setImage] = useState<string | null>(null); // new photo (data URL), not yet saved
  const [resetImage, setResetImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = image ?? (resetImage ? null : item.image || null);
  const usesUpload = item.image.startsWith('/shop/media/');
  const hasBuiltInPhoto = Boolean(item.stockColumn && DEFAULT_PRODUCT_LOOK[item.stockColumn]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        ...form,
        price: Number(form.price.replace(/\D/g, '')),
        compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice.replace(/\D/g, '')) : null,
        initialStock: isNew && form.initialStock ? Number(form.initialStock.replace(/\D/g, '')) : undefined,
        image,
        resetImage,
      };
      if (isNew) await send('/api/website/products', 'POST', body);
      else await send(`/api/website/products/${item.product}`, 'PATCH', body);
      setImage(null);
      setResetImage(false);
      router.refresh();
      if (isNew) onDone?.(`"${form.name.trim()}" added. It is on the website now (at the bottom of the list) and in Inventory, Orders and Stock Movement.`);
      else setMessage({ ok: true, text: 'Saved. The website shows the change now.' });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`a-card p-5 ${form.visible ? '' : 'opacity-75'} ${isNew ? 'border-blue-300' : ''}`}>
      {isNew && (
        <div className="mb-4">
          <h2 className="font-semibold text-gray-900">New product</h2>
          <p className="text-sm text-gray-600">
            It appears on the website and in your Inventory, Orders, Stock Movement and Telegram stock alerts.
          </p>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="sm:w-48 shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full aspect-square object-cover rounded-lg bg-gray-100" />
          ) : (
            <div className="w-full aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-sm text-gray-500 text-center p-4">
              {hasBuiltInPhoto ? 'Built-in photo will be used' : 'No photo yet'}
            </div>
          )}
          <label className="mt-2 block text-center text-sm font-medium text-blue-600 cursor-pointer">
            {preview ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  setImage(await resizeImage(file, { maxSize: 900, square: true }));
                  setResetImage(false);
                } catch (err) {
                  setMessage({ ok: false, text: (err as Error).message });
                }
              }}
            />
          </label>
          {!isNew && (usesUpload || image) && !resetImage && (
            <button
              type="button"
              onClick={() => {
                setImage(null);
                setResetImage(true);
              }}
              className="mt-1 w-full text-xs text-gray-500 hover:text-red-600"
            >
              {hasBuiltInPhoto ? 'Use built-in photo' : 'Remove photo'}
            </button>
          )}
          <p className="mt-1 text-xs text-gray-400 text-center">Cropped to a square.</p>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2 block">
            <span className="text-xs font-medium text-gray-600">Name</span>
            <input className={input} value={form.name} onChange={set('name')} maxLength={80} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Size</span>
            <input className={input} value={form.size} onChange={set('size')} maxLength={40} placeholder="500 gram" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Short name for the admin &amp; Telegram (optional)</span>
            <input className={input} value={form.shortName} onChange={set('shortName')} maxLength={30} placeholder={form.name || 'e.g. Babi Manis'} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Box counter value{isNew ? ' *' : ''}</span>
            <input className={input} value={form.boxValue} onChange={set('boxValue')} inputMode="decimal" placeholder="e.g. 1 or 0.5" />
            <span className="mt-0.5 block text-xs text-gray-500">
              How many boxes 1 pack counts as in the order box counter (reseller sales, parent fee). Decimals allowed.
              {!isNew && ' A change applies to new and edited orders only.'}
            </span>
          </label>
          {isNew ? (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Starting stock (optional)</span>
              <input className={input} value={form.initialStock} onChange={set('initialStock')} inputMode="numeric" placeholder="0" />
            </label>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Stock</span>
              <input
                className={`${input} bg-gray-50 text-gray-500`}
                value={item.stockColumn ? `${stock} in stock (change it on the Inventory page)` : 'Website-only, not stock-tracked'}
                readOnly
              />
            </label>
          )}
          <label className="sm:col-span-2 block">
            <span className="text-xs font-medium text-gray-600">Description</span>
            <textarea className={`${input} h-20 resize-none`} value={form.description} onChange={set('description')} maxLength={300} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Price (Rp)</span>
            <input className={input} value={form.price} onChange={set('price')} inputMode="numeric" placeholder="e.g. 160000" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Original price, shown crossed out (optional)</span>
            <input className={input} value={form.compareAtPrice} onChange={set('compareAtPrice')} inputMode="numeric" placeholder="e.g. 200000" />
          </label>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.visible} onChange={(e) => setForm((f) => ({ ...f, visible: e.target.checked }))} className="size-4" />
            Show on the website
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
        <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
          {busy ? 'Saving…' : isNew ? 'Add product' : 'Save'}
        </button>
        {isNew ? (
          <button type="button" onClick={() => onDone?.()} className="px-3 py-2 rounded-lg border text-sm">
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy || first}
              onClick={() => act(() => send(`/api/website/products/${item.product}`, 'POST', { direction: 'up' }))}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-30"
            >
              ↑ Move up
            </button>
            <button
              type="button"
              disabled={busy || last}
              onClick={() => act(() => send(`/api/website/products/${item.product}`, 'POST', { direction: 'down' }))}
              className="px-3 py-2 rounded-lg border text-sm disabled:opacity-30"
            >
              ↓ Move down
            </button>
            <span className="text-sm text-gray-500">
              Now: {formatRupiah(item.price)}
              {item.compareAtPrice ? ` (was ${formatRupiah(item.compareAtPrice)})` : ''} · {item.visible ? 'shown' : 'hidden'}
            </span>
            {deletable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete "${item.name}"? Past orders keep it, but it disappears from the website. This cannot be undone.`)) {
                    act(() => send(`/api/website/products/${item.product}`, 'DELETE'));
                  }
                }}
                className="ml-auto px-3 py-2 rounded-lg text-sm text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            )}
          </>
        )}
      </div>
      {message && <p className={`mt-3 text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </article>
  );
}

export default function WebsiteProductsPanel({
  products,
  stock,
  deletable,
}: {
  products: CatalogItem[];
  stock: Record<string, number>;
  deletable: string[]; // products that may be deleted
}) {
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="mt-6 space-y-4">
      {notice && <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
      {adding ? (
        <ProductEditor
          key={`new-${addKey}`}
          item={BLANK}
          stock={null}
          isNew
          onDone={(savedMessage) => {
            setAdding(false);
            setAddKey((k) => k + 1);
            setNotice(savedMessage ?? null);
          }}
        />
      ) : (
        <button type="button" onClick={() => { setAdding(true); setNotice(null); }} className="px-4 py-2 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white text-sm font-medium">
          + Add product
        </button>
      )}
      {products.map((item, i) => (
        // key includes the order so editors re-mount with fresh values after a move
        <ProductEditor
          key={`${item.product}-${item.sortOrder}`}
          item={item}
          stock={item.stockColumn ? stock[item.stockColumn] ?? 0 : null}
          deletable={deletable.includes(item.product)}
          first={i === 0}
          last={i === products.length - 1}
        />
      ))}
    </div>
  );
}
