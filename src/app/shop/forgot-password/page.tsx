'use client';

import { useState } from 'react';
import { Card, ErrorBox, Field, SubmitButton } from '../_components/Form';
import { postJson, useShop } from '../_components/ShopProvider';

export default function ForgotPasswordPage() {
  const { base } = useShop();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await postJson(base, '/forgot-password', { email: form.get('email') });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Lupa password" subtitle="Kami akan mengirim link untuk membuat password baru.">
      {done ? (
        <p className="text-sm">Jika email tersebut terdaftar, link reset sudah dikirim. Cek kotak masuk (dan folder spam) Anda.</p>
      ) : (
        <form onSubmit={submit}>
          <ErrorBox message={error} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <SubmitButton busy={busy}>Kirim link reset</SubmitButton>
        </form>
      )}
    </Card>
  );
}
