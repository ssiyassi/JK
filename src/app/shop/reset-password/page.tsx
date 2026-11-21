'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Card, ErrorBox, Field, SubmitButton } from '../_components/Form';
import { postJson, useShop } from '../_components/ShopProvider';

function ResetForm() {
  const { base, href } = useShop();
  const params = useSearchParams();
  const token = params.get('token') || '';
  // From the email sent after a guest checkout: the account's first password.
  const setup = params.get('setup') === '1';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get('password') !== form.get('confirm')) {
      setError('Konfirmasi password tidak sama');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJson(base, '/reset-password', { token, password: form.get('password') });
      window.location.href = href('/account');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card title={setup ? 'Buat password akun Anda' : 'Buat password baru'} subtitle={setup ? 'Setelah ini Anda langsung masuk dan bisa melihat semua pesanan serta voucher Anda.' : undefined}>
      <form onSubmit={submit}>
        <ErrorBox message={error} />
        <Field label={setup ? 'Password' : 'Password baru'} name="password" type="password" autoComplete="new-password" minLength={8} required />
        <Field label={setup ? 'Ulangi password' : 'Ulangi password baru'} name="confirm" type="password" autoComplete="new-password" minLength={8} required />
        <SubmitButton busy={busy}>Simpan password</SubmitButton>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
