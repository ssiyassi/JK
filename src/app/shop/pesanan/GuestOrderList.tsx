'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readGuestOrders, type GuestOrderRef } from '@/lib/client/guestOrders';
import { useShop } from '../_components/ShopProvider';

/** Guests: the orders placed in this browser (their pages open with the key kept in this browser). */
export default function GuestOrderList() {
  const { href } = useShop();
  const [orders, setOrders] = useState<GuestOrderRef[] | null>(null);
  useEffect(() => setOrders(readGuestOrders()), []);
  if (orders === null) return <div className="h-24 rounded-[20px] bg-[#f3f4f6] animate-pulse" />;
  if (!orders.length) {
    return (
      <div className="rounded-[20px] bg-white p-5 text-center text-sm text-[#4b5563] shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]">
        <p>Belum ada pesanan di browser ini.</p>
        <Link href={href('/')} className="mt-3 inline-block rounded-[14px] bg-[#9a3412] px-5 py-2.5 font-bold text-white">
          Mulai belanja
        </Link>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link
            href={href(`/orders/${o.id}`)}
            className="flex items-center justify-between gap-3 rounded-[20px] bg-white p-4 shadow-[0_1px_2px_rgba(59,26,12,0.06),0_6px_18px_rgba(59,26,12,0.07)]"
          >
            <span>
              <b className="block text-[15px] text-[#111827]">Pesanan #{o.orderId}</b>
              <span className="text-xs text-[#6b7280]">
                Dibuat {new Date(o.at).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </span>
            <span className="rounded-[11px] border-[1.5px] border-[#9a3412] px-4 py-2 text-[13px] font-bold text-[#9a3412]">Lihat</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
