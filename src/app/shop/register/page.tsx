'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { formatRupiah } from '@/lib/shop/catalog';
import { trackMeta } from '@/lib/client/metaPixel';
import { Card, ErrorBox, Field, safeNext, SubmitButton } from '../_components/Form';
import { postJson, useShop } from '../_components/ShopProvider';

function RegisterForm() {
  const { base, href, welcomeVoucher } = useShop();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The email already has an account from an earlier order without login: a "Buat password" link was emailed.
  const [setupSentTo, setSetupSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ setupEmailSent?: boolean; welcome?: boolean }>(base, '/register', Object.fromEntries(form.entries()));
      if (res.setupEmailSent) {
        setSetupSentTo(String(form.get('email')));
        setBusy(false);
        return;
      }
      // Meta: a new account is complete (welcome voucher issued). Short pause so it is sent.
      trackMeta('CompleteRegistration', { status: 'registered' });
      await new Promise((r) => setTimeout(r, 400));
      window.location.href = safeNext(params.get('next'), href(res.welcome ? '/account?welcome=1' : '/account'));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (setupSentTo) {
    return (
      <Card title="Cek email Anda">
        <p className="text-[#5c4d42]">
          Email <b>{setupSentTo}</b> sudah punya akun dari pesanan sebelumnya. Kami sudah mengirim link ke email tersebut. Buka emailnya dan
          tekan <b>Buat password</b>, lalu Anda bisa langsung masuk.
        </p>
        <p className="text-sm text-[#8a7a6d] mt-3">Tidak ada email? Cek folder spam, atau pakai &quot;Lupa password&quot; di halaman Masuk.</p>
      </Card>
    );
  }

  return (
    <Card
      title="Daftar akun"
      subtitle={
        <>
          Dapatkan voucher diskon {welcomeVoucher.percent}% (maks. {formatRupiah(welcomeVoucher.cap)}) yang dikirim ke email Anda. Sudah punya akun?{' '}
          <Link className="text-[#9a3412] font-semibold" href={href('/login')}>
            Masuk
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        <Field label="Nama" name="name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required hint="Voucher dikirim ke email ini." />
        <Field label="Nomor HP" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="08xxxxxxxxxx" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} required hint="Minimal 8 karakter." />
        <Field
          label="Nomor HP teman yang mengajak Anda"
          name="referrerPhone"
          type="tel"
          inputMode="tel"
          placeholder="08xxxxxxxxxx"
          hint="Jika ada. Teman Anda akan mendapat voucher setelah pesanan pertama Anda diterima."
        />
        <SubmitButton busy={busy}>Daftar</SubmitButton>
      </form>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
