'use client';

import { useEffect, useState } from 'react';
import { Card, ErrorBox, safeNext, SubmitButton } from './Form';
import { postJson, useShop } from './ShopProvider';
import { trackMeta } from '@/lib/client/metaPixel';

const RESEND_SECONDS = 60;

export default function VerifyEmailForm({
  email,
  voucherText,
  next,
  resendWait,
}: {
  email: string;
  voucherText: string;
  next: string | null;
  /** Seconds before "send again" works (a code was sent less than a minute ago). */
  resendWait: number;
}) {
  const { base, href } = useShop();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait] = useState(resendWait);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '');
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await postJson(base, '/verify-email', { action: 'verify', code });
      // Meta: a new account is complete (email confirmed, welcome voucher issued). Short pause so it is sent.
      trackMeta('CompleteRegistration', { status: 'confirmed' });
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = safeNext(next, href('/account?welcome=1'));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    setWait(RESEND_SECONDS);
    try {
      await postJson(base, '/verify-email', { action: 'send' });
      setNotice(`Kode baru sudah dikirim ke ${email}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card
      title="Konfirmasi email Anda"
      subtitle={
        <>
          Kami sudah mengirim kode 6 angka ke <b className="break-all">{email}</b>. Masukkan kodenya untuk mengaktifkan voucher selamat
          datang {voucherText}.
        </>
      }
    >
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        {notice && <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm px-3 py-2">{notice}</div>}
        <label className="block mb-4">
          <span className="block text-sm font-medium mb-1">Kode konfirmasi</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            placeholder="123456"
            required
            autoFocus
            className="w-full rounded-lg border border-[#d9cabd] bg-white px-3 py-2.5 text-center text-2xl tracking-[0.4em] outline-none focus:border-[#9a3412] focus:ring-2 focus:ring-[#9a3412]/20"
          />
          <span className="block text-xs text-[#8a7a6d] mt-1">Tidak menemukan emailnya? Cek folder Spam atau Promosi.</span>
        </label>
        <SubmitButton busy={busy}>Konfirmasi</SubmitButton>
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" onClick={resend} disabled={wait > 0} className="font-semibold text-[#9a3412] disabled:text-[#8a7a6d]">
          {wait > 0 ? `Kirim ulang kode (${wait} dtk)` : 'Kirim ulang kode'}
        </button>
        <a href={safeNext(next, href('/'))} className="text-[#5c4d42] underline underline-offset-2">
          Nanti saja
        </a>
      </div>
    </Card>
  );
}
