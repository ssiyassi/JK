'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { resizeImage } from '@/lib/client/resizeImage';
import { paydayMessage, paydayMonth, paydayPeriod, type PaydayPromo } from '@/lib/shop/payday-text';

const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#9a3412] focus:ring-blue-500';

/** Website → Payday: poster, promo dates, caption and the reseller WhatsApp message for this month's Payday Promo. */
export default function PaydayPromoPanel({ promo, link }: { promo: PaydayPromo; link: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    startDate: promo.startDate,
    endDate: promo.endDate,
    caption: promo.caption,
    whatsappTemplate: promo.whatsappTemplate,
  });
  const [newImage, setNewImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setMessage(null);
  };

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) && /^\d{4}-\d{2}-\d{2}$/.test(form.endDate);
  const month = valid ? paydayMonth(form) : '';
  const sample = paydayMessage(form.whatsappTemplate, 'Michelle', month, link);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/website/payday', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ...(newImage ? { image: newImage } : {}) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to save');
      setNewImage(null);
      setMessage({ ok: true, text: 'Saved. The page and the WhatsApp buttons on My Resellers now use this.' });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-gray-900">Poster</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={newImage ?? promo.image} alt="Payday poster" className="w-full h-auto rounded-xl border border-gray-200 bg-white" />
        <label className="text-sm text-gray-700">
          <span className="block mb-1">Replace poster (JPG or PNG, portrait works best):</span>
          <input
            type="file"
            accept="image/*"
            className="block w-full text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setNewImage(await resizeImage(file, { maxSize: 1200, quality: 0.78 }));
                setMessage(null);
              } catch (err) {
                setMessage({ ok: false, text: (err as Error).message });
              }
            }}
          />
        </label>
        {newImage && <p className="text-xs text-amber-700">New poster chosen. Press Save to publish it.</p>}
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-800">
            Start date
            <input type="date" className={`${input} mt-1`} value={form.startDate} onChange={set('startDate')} />
          </label>
          <label className="text-sm font-medium text-gray-800">
            End date (last day)
            <input type="date" className={`${input} mt-1`} value={form.endDate} onChange={set('endDate')} />
          </label>
        </div>
        {valid && (
          <p className="text-sm text-gray-600 -mt-2">
            Shown on the page as <b>Payday Promo {month}</b> · <b>{paydayPeriod(form)}</b>. After the end date the page says
            &ldquo;Promo sudah berakhir&rdquo;.
          </p>
        )}

        <label className="text-sm font-medium text-gray-800">
          Caption (one point per line, shown under the poster)
          <textarea className={`${input} mt-1 h-32`} value={form.caption} onChange={set('caption')} maxLength={1500} />
        </label>

        <label className="text-sm font-medium text-gray-800">
          WhatsApp message to resellers
          <textarea className={`${input} mt-1 h-36`} value={form.whatsappTemplate} onChange={set('whatsappTemplate')} maxLength={1500} />
        </label>
        <p className="text-xs text-gray-600 -mt-2">
          <code>{'{{reseller name}}'}</code> = the reseller&apos;s name · <code>{'{{month}}'}</code> = the promo month ({month || '…'}) ·{' '}
          <code>{'{{link}}'}</code> = the page link, which shows the poster as a picture in WhatsApp (put it on its own line).
        </p>
        {!/\{\{\s*link\s*\}\}/i.test(form.whatsappTemplate) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
            The message has no {'{{link}}'}: resellers will not see the poster.
          </p>
        )}
        <div>
          <p className="text-sm font-medium text-gray-800">Preview (for a reseller called Michelle)</p>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[#e7ffdb] border border-green-200 p-3 text-sm text-gray-900 font-sans">{sample}</pre>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy || !valid}
            className="px-5 py-2.5 rounded-lg bg-[#9a3412] hover:bg-[#7c2d12] text-white font-semibold disabled:bg-gray-400"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <a href={link} target="_blank" rel="noreferrer" className="text-sm text-blue-600">
            Open the page ↗
          </a>
        </div>
        {message && (
          <p className={`text-sm rounded-md px-3 py-2 ${message.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
