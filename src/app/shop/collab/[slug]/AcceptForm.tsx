'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useShop } from '../../_components/ShopProvider';
import { CollabField, CollabTextArea } from '../CollabFields';

/** "Ayo collab!" form on the influencer's offer page: shipping address and bank details for the commission. */
export default function AcceptForm({ slug }: { slug: string }) {
  const { base } = useShop();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!agree) return setError('Centang persetujuan ketentuan kerja sama terlebih dahulu');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    try {
      const res = await fetch(`${base}/api/collab/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, slug, agree }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Gagal mengirim. Silakan coba lagi.');
      router.refresh();
      document.getElementById('setuju')?.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-x-4 sm:grid-cols-2">
      <CollabField label="Nama lengkap" name="name" autoComplete="name" required maxLength={100} />
      <CollabField label="Nomor WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="081234567890" required maxLength={20} />
      <div className="sm:col-span-2">
        <CollabTextArea label="Alamat pengiriman produk" name="address" placeholder="Jalan, nomor rumah, RT/RW, kelurahan, kecamatan, kota, kode pos" required maxLength={500} rows={3} />
      </div>
      <CollabField label="Bank / e-wallet" name="bank" placeholder="BCA, Mandiri, GoPay, …" required maxLength={60} />
      <CollabField label="Nomor rekening" name="accountNumber" inputMode="numeric" required maxLength={40} />
      <div className="sm:col-span-2">
        <CollabField label="Nama pemilik rekening" name="accountName" required maxLength={100} />
        <CollabTextArea label="Pesan untuk kami" name="message" maxLength={500} rows={2} />
      </div>
      <label className="sm:col-span-2 mb-4 flex items-start gap-3 rounded-2xl bg-[#fdf3ea] p-4 text-sm leading-6 text-[#3b1a0c]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#9a3412]" />
        <span>Saya sudah membaca dan setuju dengan ketentuan kerja sama di halaman ini.</span>
      </label>
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
        {busy ? 'Mengirim…' : 'Ayo collab! 🤝'}
      </button>
    </form>
  );
}
