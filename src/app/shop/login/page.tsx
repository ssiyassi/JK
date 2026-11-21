'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { readGuestOrders, type GuestOrderRef } from '@/lib/client/guestOrders';
import { shopAsset } from '@/lib/shop/catalog';
import { ErrorBox, safeNext } from '../_components/Form';
import RegisterPromo from '../_components/RegisterPromo';
import { postJson, useShop } from '../_components/ShopProvider';
import { playfair } from '../fonts';

function Icon({ d, className = 'size-5' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  mail: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm-1 1 9 6 9-6',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Zm2 0V8a4 4 0 0 1 8 0v3m-4 4v2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  eyeOff: 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  userPlus: 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 10a7 7 0 0 1 11.5-5.4M19 14v6m-3-3h6',
};

const input =
  'w-full h-12 sm:h-14 rounded-xl border border-[#eadbcb] bg-[#fdfaf6] pl-11 sm:pl-12 text-base text-[#111827] placeholder:text-[#9a948e] outline-none focus:border-[#9a3412] focus:bg-white focus:ring-2 focus:ring-[#9a3412]/15';

function LoginForm() {
  const { base, href } = useShop();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Orders placed as a guest in this browser (read after load: the list lives in this browser only).
  const [guestOrders, setGuestOrders] = useState<GuestOrderRef[]>([]);
  useEffect(() => setGuestOrders(readGuestOrders()), []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await postJson(base, '/login', { email: form.get('email'), password: form.get('password') });
      window.location.href = safeNext(params.get('next'), href('/'));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const next = params.get('next');
  const registerHref = href('/register') + (next ? `?next=${encodeURIComponent(next)}` : '');
  return (
    <div className={`${playfair.variable} max-w-md mx-auto space-y-4 sm:space-y-5 sm:pt-4`}>
      <div className="relative overflow-hidden rounded-3xl border border-[#f1e4d6] bg-[#fffdfa] p-5 sm:p-8 shadow-[0_8px_30px_-12px_rgba(120,72,40,0.18)]">
        <img
          src={shopAsset('/icons/leaf.svg')}
          alt=""
          width={36}
          height={36}
          className="pointer-events-none absolute -right-3 -top-3 size-16 rotate-12 opacity-[0.07]"
        />
        <h1 className="relative font-[family-name:var(--font-heading)] font-bold text-[25px] leading-8 sm:text-[34px] sm:leading-[42px] text-[#2b1a12]">
          Selamat datang kembali
        </h1>
        <p className="mt-1 text-[15px] sm:text-base text-[#5c4d42]">Masuk untuk melanjutkan pesanan Anda</p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          <ErrorBox message={error} />
          <label className="block">
            <span className="block mb-2 text-[15px] font-medium text-[#2b211b]">Email</span>
            <span className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280]">
                <Icon d={ICONS.mail} />
              </span>
              <input name="email" type="email" autoComplete="email" required placeholder="Masukkan email Anda" className={input} />
            </span>
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor="password" className="text-[15px] font-medium text-[#2b211b]">
                Password
              </label>
              <Link href={href('/forgot-password')} className="text-sm text-[#9a3412] hover:underline">
                Lupa password?
              </Link>
            </div>
            <span className="relative block">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#6b7280]">
                <Icon d={ICONS.lock} />
              </span>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="Masukkan password Anda"
                className={`${input} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#6b7280] hover:text-[#2b211b]"
              >
                <Icon d={showPassword ? ICONS.eye : ICONS.eyeOff} />
              </button>
            </span>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-12 sm:h-14 flex items-center justify-center gap-2 rounded-xl bg-[#9a3412] text-white text-lg font-bold hover:bg-[#7c2d12] disabled:opacity-60 shadow-[0_6px_16px_-8px_rgba(154,52,18,0.6)]"
          >
            {busy ? (
              'Mohon tunggu…'
            ) : (
              <>
                Masuk <Icon d={ICONS.arrow} />
              </>
            )}
          </button>
        </form>

        <div className="my-5 flex items-center gap-4 text-sm text-[#8a7a6d]">
          <span className="h-px flex-1 bg-[#eee3d8]" />
          atau
          <span className="h-px flex-1 bg-[#eee3d8]" />
        </div>

        <Link
          href={registerHref}
          className="w-full h-12 sm:h-14 flex items-center justify-center gap-3 rounded-xl border-[1.5px] border-[#9a3412] text-[#9a3412] text-lg font-bold hover:bg-[#fdf3ea]"
        >
          <Icon d={ICONS.userPlus} className="size-6" />
          Buat Akun Baru
        </Link>
        {next?.includes('/checkout') && (
          <Link href={safeNext(next, href('/checkout'))} className="mt-4 block text-center text-[15px] font-semibold text-[#9a3412] hover:underline">
            Lanjut checkout tanpa akun
          </Link>
        )}
      </div>

      {guestOrders.length > 0 && (
        <section className="rounded-3xl border border-[#f1e4d6] bg-[#fffdfa] p-5 sm:p-6">
          <h2 className="font-bold text-[#2b1a12]">Pesanan tanpa akun di perangkat ini</h2>
          <ul className="mt-3 divide-y divide-[#f1e7dd]">
            {guestOrders.map((o) => (
              <li key={o.id}>
                <Link href={href(`/orders/${o.id}`)} className="flex items-center justify-between gap-3 py-2.5 text-[15px] text-[#2b211b] hover:text-[#9a3412]">
                  <span className="font-semibold tabular-nums">#{o.orderId}</span>
                  <span className="text-sm text-[#8a7a6d]">
                    {new Date(o.at).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RegisterPromo href={registerHref} compact />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
