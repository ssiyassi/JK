'use client';

import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const BOX =
  'w-full rounded-xl border border-[#d9cabd] bg-white px-3 py-3 text-base text-[#3b1a0c] outline-none focus:border-[#9a3412] focus:ring-2 focus:ring-[#9a3412]/20';

function Label({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="mb-1 block text-sm font-semibold text-[#3b1a0c]">
      {label}
      {!required && <span className="font-normal text-[#8a7a6d]"> (opsional)</span>}
    </span>
  );
}

export function CollabField({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <Label label={label} required={props.required} />
      <input {...props} className={BOX} />
    </label>
  );
}

export function CollabTextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="mb-4 block">
      <Label label={label} required={props.required} />
      <textarea {...props} className={BOX} />
    </label>
  );
}
