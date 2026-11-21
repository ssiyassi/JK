'use client';

import { useState } from 'react';
import { useShop } from '../_components/ShopProvider';

/** "Sudah daftar?" box on jentiskitchen.id/affiliate: we email the affiliate their links again. */
export default function FindLinkForm() {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/affiliate/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gagal mengirim email. Silakan coba lagi.');
      setSentTo(email.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <p className="rounded-xl bg-green-50 px-4 py-3 text-[15px] leading-6 text-green-900">
        ✅ Kalau <b>{sentTo}</b> terdaftar sebagai affiliate, link kamu sudah kami kirim ke email itu. Cek juga folder Spam / Promosi ya.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        maxLength={200}
        placeholder="Email yang kamu daftarkan"
        aria-label="Email yang kamu daftarkan"
        className="min-w-0 flex-1 rounded-xl border border-[#d9cabd] bg-white px-3 py-3 text-base outline-none focus:border-[#9a3412] focus:ring-2 focus:ring-[#9a3412]/20"
      />
      <button type="submit" disabled={busy} className="rounded-xl bg-[#3b1a0c] px-5 py-3 font-bold text-white disabled:opacity-60">
        {busy ? 'Mengirim…' : 'Kirim link saya'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-700 sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
