'use client';

import { useState } from 'react';
import { useShop } from '../_components/ShopProvider';
import { CollabField, CollabTextArea } from './CollabFields';

/** Sign-up form on jentiskitchen.id/collab; lands in Website → Collabs with a Telegram alert to the owner. */
export default function ApplyForm() {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [platform, setPlatform] = useState<'instagram' | 'tiktok'>('instagram');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/collab/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, platform }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gagal mengirim. Silakan coba lagi.');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-[#fdf3ea] p-6 text-center">
        <p className="text-5xl" aria-hidden>
          🎉
        </p>
        <p className="mt-2 font-[family-name:var(--font-heading)] text-2xl font-bold">Terima kasih sudah mendaftar!</p>
        <p className="mt-1 text-[#5c4d42]">Kami cek profil kamu dulu, lalu hubungi kamu lewat WhatsApp kalau cocok.</p>
      </div>
    );
  }

  const tab = (value: 'instagram' | 'tiktok', label: string) => (
    <button
      type="button"
      onClick={() => setPlatform(value)}
      aria-pressed={platform === value}
      className={`flex-1 rounded-full py-2.5 font-semibold ${platform === value ? 'bg-[#9a3412] text-white' : 'bg-[#fdf3ea] text-[#9a3412]'}`}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} className="grid gap-x-4 sm:grid-cols-2">
      <CollabField label="Nama" name="name" autoComplete="name" required maxLength={100} />
      <CollabField label="Nomor WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="081234567890" required maxLength={20} />
      <div className="mb-4 sm:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-[#3b1a0c]">Platform utama</span>
        <div className="flex gap-2">
          {tab('instagram', 'Instagram')}
          {tab('tiktok', 'TikTok')}
        </div>
      </div>
      <CollabField label={`Username ${platform === 'tiktok' ? 'TikTok' : 'Instagram'}`} name="handle" placeholder="@username" required maxLength={80} autoCapitalize="none" />
      <CollabField label="Jumlah followers" name="followers" placeholder="contoh: 12rb" required maxLength={30} />
      <div className="sm:col-span-2">
        <CollabField label="Kota" name="city" maxLength={60} />
        <CollabTextArea label="Ceritakan sedikit tentang konten kamu" name="message" maxLength={500} rows={3} />
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
        {busy ? 'Mengirim…' : 'Kirim pendaftaran'}
      </button>
    </form>
  );
}
