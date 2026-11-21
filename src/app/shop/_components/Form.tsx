'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';

export function Card({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-md mx-auto bg-white rounded-2xl border border-[#eadfd5] p-5 sm:p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <div className="mt-1 text-sm text-[#5c4d42]">{subtitle}</div>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function Field({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block mb-4">
      <span className="block text-sm font-medium mb-1">
        {label}
        {!props.required && <span className="font-normal text-[#8a7a6d]"> (opsional)</span>}
      </span>
      <input
        {...props}
        className="w-full rounded-lg border border-[#d9cabd] bg-white px-3 py-2.5 text-base outline-none focus:border-[#9a3412] focus:ring-2 focus:ring-[#9a3412]/20"
      />
      {hint && <span className="block text-xs text-[#8a7a6d] mt-1">{hint}</span>}
    </label>
  );
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
      {message}
    </div>
  );
}

export function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full py-3 rounded-lg bg-[#9a3412] text-white font-semibold hover:bg-[#7c2d12] disabled:opacity-60"
    >
      {busy ? 'Mohon tunggu…' : children}
    </button>
  );
}

/** Only allow redirects to a path on this site (never to another domain). */
export function safeNext(next: string | null, fallback: string): string {
  // Only paths on this site: "//x" and "/\x" would be read by the browser as another website.
  return next && /^\/(?![/\\])/.test(next) && !/[\\\s]/.test(next) ? next : fallback;
}
