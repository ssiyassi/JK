'use client';

import { useState } from 'react';
import { postJson, useShop } from './ShopProvider';

/** Shown only to the owner while signed in as a customer ("Login as customer" in the admin). */
export default function AdminSessionBar({ name, email }: { name: string; email: string }) {
  const { base, href } = useShop();
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    try {
      await postJson(base, '/logout', {});
    } finally {
      window.location.href = href('/');
    }
  }

  return (
    <div className="bg-[#1e40af] text-white text-sm px-4 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1" role="status">
      <p className="min-w-0 break-words">
        <b>Admin mode:</b> signed in as {name} ({email}). Orders go to this customer&apos;s account and email. Ends after 2 hours.
      </p>
      <button type="button" onClick={exit} disabled={busy} className="shrink-0 rounded-lg bg-white px-3 py-1 font-semibold text-[#1e40af] disabled:opacity-60">
        Exit
      </button>
    </div>
  );
}
