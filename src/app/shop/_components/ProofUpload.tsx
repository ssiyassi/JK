'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson, useShop } from './ShopProvider';

/** Must match MAX_PROOF_PDF_BYTES in lib/shop/orders.ts (a database row holds at most 2 MB). */
const MAX_PDF_BYTES = 1_300_000;

/** Shrinks the photo in the browser (max 1600px, JPEG) so uploads are small and fast on mobile data. */
async function resize(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** Transfer proof: the customer picks a photo/screenshot or PDF, checks it, then sends it with "Kirim bukti transfer". */
export default function ProofUpload({ orderRowId, uploaded }: { orderRowId: string; uploaded: boolean }) {
  const { base } = useShop();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(uploaded);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    setError(null);
    if (isPdf(picked)) {
      if (picked.size > MAX_PDF_BYTES) {
        setError('File PDF terlalu besar (maks. 1,3 MB). Kirim foto atau screenshot bukti transfer saja.');
        return;
      }
    } else if (!picked.type.startsWith('image/')) {
      setError('Pilih foto/screenshot atau file PDF.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(picked);
    setPreview(isPdf(picked) ? null : URL.createObjectURL(picked));
  }

  async function send() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = isPdf(file) ? (await readAsDataUrl(file)).replace(/^data:[^;]*;/, 'data:application/pdf;') : await resize(file);
      await postJson(base, `/orders/${orderRowId}/proof`, { image });
      setDone(true);
      setFile(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message || 'Gagal mengunggah. Coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {done && !file && (
        <p className="mb-3 rounded-lg bg-green-50 border border-green-200 text-green-900 text-sm px-3 py-2">
          Bukti transfer terkirim ✓ Kami akan mengecek dan mengonfirmasi pembayaran Anda.
        </p>
      )}
      {!done && !file && <p className="mb-2 text-sm font-semibold text-[#111827]">Sudah transfer? Unggah bukti transfer di sini:</p>}

      {file && (
        <div className="mb-3 rounded-xl border border-[#eadfd5] bg-[#faf6f1] p-3 flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Bukti transfer yang dipilih" className="size-16 rounded-lg object-cover bg-white" />
          ) : (
            <span className="size-16 rounded-lg bg-white border border-[#eadfd5] flex items-center justify-center text-sm font-bold text-[#9a3412]">
              PDF
            </span>
          )}
          <span className="min-w-0 flex-1 text-sm text-[#111827] break-all">{file.name}</span>
        </div>
      )}

      <label
        className={`block text-center py-3 rounded-lg font-semibold cursor-pointer ${
          file || done ? 'border border-[#d9cabd] text-[#5c4d42]' : 'bg-[#9a3412] text-white hover:bg-[#7c2d12]'
        } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {file ? 'Pilih file lain' : done ? 'Ganti bukti transfer' : 'Pilih foto / screenshot / PDF'}
        <input type="file" accept="image/*,application/pdf,.pdf" className="sr-only" onChange={onPick} />
      </label>

      {file && (
        <button
          type="button"
          disabled={busy}
          onClick={send}
          className="mt-3 w-full py-3.5 rounded-xl bg-[#9a3412] hover:bg-[#7c2d12] text-white font-semibold disabled:opacity-60"
        >
          {busy ? 'Mengirim…' : 'Kirim bukti transfer'}
        </button>
      )}
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
    </div>
  );
}
