'use client';

import type { ReactNode } from 'react';
import type { StockProduct } from '@/lib/core/products';
import { Card, Message, Note, PRODUCT_COLORS, cx } from './admin/ui';

export interface ResellerOrderValues {
  parentReseller: string;
  recipientName: string;
  phone: string;
  address: string;
  deliveryDate: string;
  promo: string;
  free: boolean;
  quantities: Record<string, number>;
}

/** The body of the new / edit reseller order forms in the admin look: customer + products on the left, delivery + save on the right. */
export default function ResellerOrderFields({
  resellerField,
  values,
  onChange,
  products,
  showFree = true,
  message,
  submitLabel,
  canSubmit,
  resellerFilled,
}: {
  resellerField: ReactNode;
  values: ResellerOrderValues;
  onChange: (field: keyof ResellerOrderValues, value: string | boolean | Record<string, number>) => void;
  products: StockProduct[];
  showFree?: boolean;
  message: { ok: boolean; text: string } | null;
  submitLabel: string;
  canSubmit: boolean;
  resellerFilled: boolean;
}) {
  const qty = (key: string) => values.quantities[key] ?? 0;
  const setQty = (key: string, n: number) => onChange('quantities', { ...values.quantities, [key]: Math.max(0, n) });
  const boxes = products.reduce((t, p) => t + qty(p.key) * p.boxValue, 0);
  const packs = products.reduce((t, p) => t + qty(p.key), 0);
  const missing = [
    !resellerFilled && 'reseller',
    !values.recipientName.trim() && 'recipient',
    !values.phone.trim() && 'phone',
    !values.address.trim() && 'address',
    !values.deliveryDate && 'delivery date',
    !values.free && !values.promo && 'promo',
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-3 pb-24 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-[18px] lg:pb-0">
      <div className="flex min-w-0 flex-col gap-3 lg:gap-[18px]">
        <Card title="Customer">
          <div className="grid gap-3 p-4 lg:grid-cols-2 lg:p-[18px]">
            <div>
              <label htmlFor="reseller" className="a-label">Reseller *</label>
              {resellerField}
            </div>
            <div>
              <label htmlFor="parentReseller" className="a-label">Parent reseller</label>
              <input id="parentReseller" value={values.parentReseller || '—'} readOnly disabled className="a-input bg-[#f6f5f2] text-[#a1a1aa]" />
            </div>
            <div>
              <label htmlFor="recipientName" className="a-label">Recipient name *</label>
              <input id="recipientName" value={values.recipientName} onChange={(e) => onChange('recipientName', e.target.value)} placeholder="Who receives the box" className="a-input" required />
            </div>
            <div>
              <label htmlFor="phone" className="a-label">Phone *</label>
              <input id="phone" type="tel" inputMode="tel" value={values.phone} onChange={(e) => onChange('phone', e.target.value)} placeholder="08…" className="a-input" required />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="address" className="a-label">Address *</label>
              <textarea id="address" rows={3} value={values.address} onChange={(e) => onChange('address', e.target.value)} placeholder="Full delivery address" className="a-input resize-y" required />
            </div>
          </div>
        </Card>

        <Card title="Products" right={<span className="text-xs font-normal text-[#a1a1aa]">{packs ? `${packs} pack${packs > 1 ? 's' : ''} · ${+boxes.toFixed(1)} box${boxes === 1 ? '' : 'es'}` : 'none yet'}</span>}>
          <div className="px-4 lg:px-[18px]">
            {products.map((p, i) => (
              <div key={p.key} className="flex items-center gap-3 border-t border-[#f3f1ed] py-3 first:border-t-0">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                <label htmlFor={`qty-${p.key}`} className="min-w-0 flex-1">
                  <div className="font-semibold">{p.label}</div>
                  {p.boxValue !== 1 && <div className="text-xs text-[#a1a1aa]">1 pack = {p.boxValue} box</div>}
                </label>
                <div className="flex h-11 w-[150px] shrink-0 overflow-hidden rounded-[10px] border border-[#ebe8e3] bg-white">
                  <button type="button" onClick={() => setQty(p.key, qty(p.key) - 1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One less ${p.label}`}>−</button>
                  <input
                    id={`qty-${p.key}`}
                    inputMode="numeric"
                    placeholder="0"
                    value={qty(p.key) || ''}
                    onChange={(e) => setQty(p.key, parseInt(e.target.value.replace(/[^\d]/g, '')) || 0)}
                    className={cx('min-w-0 flex-1 text-center text-base font-bold tabular-nums outline-none', qty(p.key) > 0 && 'text-[#9a3412]')}
                  />
                  <button type="button" onClick={() => setQty(p.key, qty(p.key) + 1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One more ${p.label}`}>+</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-[78px] lg:gap-[18px]">
        <Card title="Delivery">
          <div className="flex flex-col gap-3 p-4 lg:p-[18px]">
            <div>
              <label htmlFor="deliveryDate" className="a-label">Delivery date *</label>
              <input id="deliveryDate" type="date" value={values.deliveryDate} onChange={(e) => onChange('deliveryDate', e.target.value)} className="a-input" required />
            </div>
            <div>
              <label htmlFor="promo" className="a-label">Promo *</label>
              <select id="promo" value={values.free ? '' : values.promo} onChange={(e) => onChange('promo', e.target.value)} disabled={values.free} required={!values.free} className="a-input disabled:bg-[#f6f5f2] disabled:text-[#a1a1aa]">
                <option value="">{values.free ? 'Not needed for a free order' : 'Select promo'}</option>
                <option value="None">None</option>
                <option value="Payday Promo">Payday Promo</option>
              </select>
            </div>
            {showFree && (
              <label className={cx('flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3', values.free ? 'border-[#9a3412] bg-[#fdf6f0]' : 'border-[#ebe8e3] bg-white')}>
                <input type="checkbox" checked={values.free} onChange={(e) => onChange('free', e.target.checked)} className="mt-0.5 size-5 accent-[#9a3412]" />
                <span>
                  <span className="block font-semibold">Free product</span>
                  <span className="block text-[12.5px] text-[#52525b]">Reward boxes: stock is still taken, payment shows <b>FREE</b>, and the boxes don&apos;t count for reseller sales or rewards.</span>
                </span>
              </label>
            )}
          </div>
        </Card>
        <Message message={message} />
        {missing.length > 0 && <Note>Still needed: {missing.join(', ')}.</Note>}
        <button type="submit" disabled={!canSubmit} className="a-btn a-btn-lg a-btn-pri hidden disabled:opacity-40 lg:inline-flex">{submitLabel}</button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ebe8e3] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button type="submit" disabled={!canSubmit} className="a-btn a-btn-lg a-btn-pri w-full disabled:opacity-40">{submitLabel}</button>
      </div>
    </div>
  );
}
