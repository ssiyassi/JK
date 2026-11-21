'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AFFILIATE_CHANNELS, CHANNEL_LABELS, type AffiliateChannel } from '@/lib/shop/affiliate-text';
import { useShop } from '../_components/ShopProvider';
import { CollabField } from '../collab/CollabFields';

/** Sign-up on jentiskitchen.id/affiliate. On success the affiliate goes straight to their own page with their link. */
export default function AffiliateForm() {
  const { base } = useShop();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<AffiliateChannel[]>([]);

  const toggle = (c: AffiliateChannel) => setChannels((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!channels.length) {
      setError('Pilih minimal satu cara promosi');
      return;
    }
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/affiliate/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, channels }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gagal mendaftar. Silakan coba lagi.');
      router.push(`${base}/affiliate/${body.slug}?baru=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-x-4 sm:grid-cols-2">
      <CollabField label="Nama" name="name" autoComplete="name" required maxLength={100} />
      <CollabField label="Kota" name="city" autoComplete="address-level2" placeholder="contoh: Jakarta Barat" required maxLength={60} />
      <CollabField label="Nomor WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="081234567890" required maxLength={20} />
      <CollabField label="Email" name="email" type="email" inputMode="email" autoComplete="email" placeholder="nama@gmail.com" required maxLength={200} />
      <p className="sm:col-span-2 -mt-2 mb-4 text-xs text-[#8a7a6d]">Link dan halaman komisi kamu kami kirim ke email ini.</p>
      <fieldset className="mb-5 sm:col-span-2">
        <legend className="mb-1 block text-sm font-semibold text-[#3b1a0c]">
          Cara kamu promosi <span className="font-normal text-[#8a7a6d]">(boleh pilih lebih dari 1)</span>
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {AFFILIATE_CHANNELS.map((c) => {
            const on = channels.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-[15px] font-semibold leading-5 ${
                  on ? 'border-[#9a3412] bg-[#9a3412] text-white' : 'border-[#ecd5bf] bg-[#fdf3ea] text-[#7c2d12]'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-xs ${on ? 'bg-white text-[#9a3412]' : 'border-2 border-[#d9b99f] bg-white'}`}
                >
                  {on ? '✓' : ''}
                </span>
                {CHANNEL_LABELS[c]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="sm:col-span-2 mb-4 rounded-2xl bg-[#fdf3ea] p-4">
        <p className="font-bold">Rekening untuk transfer komisi</p>
        <p className="mb-3 text-sm text-[#5c4d42]">Komisi kami transfer ke rekening ini setiap hari Minggu.</p>
        <CollabField label="Bank / e-wallet" name="bank" placeholder="contoh: BCA" required maxLength={60} />
        <CollabField label="Nama pemilik rekening" name="accountName" required maxLength={100} />
        <div className="-mb-4">
          <CollabField label="Nomor rekening" name="accountNumber" inputMode="numeric" required maxLength={40} />
        </div>
      </div>

      {error && (
        <p role="alert" className="sm:col-span-2 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="sm:col-span-2 rounded-full bg-[#9a3412] py-3.5 text-lg font-bold text-white shadow-[0_5px_0_#5a1f0a] hover:bg-[#7c2d12] disabled:opacity-60"
      >
        {busy ? 'Mendaftar…' : 'Daftar & dapatkan link saya'}
      </button>
      <p className="sm:col-span-2 mt-3 text-center text-xs text-[#8a7a6d]">Gratis. Data rekening hanya dipakai untuk transfer komisi.</p>
    </form>
  );
}
