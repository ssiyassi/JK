'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIdempotencyKey } from '@/lib/client/useIdempotencyKey';
import type { StockProduct } from '@/lib/core/products';
import { Card, Message, Note, PRODUCT_COLORS, cx } from './admin/ui';

interface StockAdjustmentFormProps {
  products: StockProduct[]
  currentInventory: Record<string, number>
}

/** Fix a count: type what is really in the freezer for every product, then save all of them at once. */
export default function StockAdjustmentForm({ products, currentInventory }: StockAdjustmentFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((p) => [p.key, String(currentInventory[p.key] ?? 0)])),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionKey = useIdempotencyKey();
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)
  const router = useRouter()

  const set = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value.replace(/[^\d]/g, '') }))
    if (message) setMessage(null)
  }
  const step = (key: string, by: number) => set(key, String(Math.max(0, (Number(formData[key]) || 0) + by)))

  const changes = products
    .map((p) => ({ p, from: currentInventory[p.key] ?? 0, to: formData[p.key] === '' ? null : Number(formData[p.key]) }))
    .filter((c) => c.to !== null && c.to !== c.from)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (changes.length === 0) return
    if (!confirm(`Save ${changes.length} change${changes.length > 1 ? 's' : ''}?\n\n${changes.map((c) => `${c.p.label}: ${c.from} → ${c.to}`).join('\n')}`)) return
    setIsSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/stock-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionKey.current() },
        body: JSON.stringify(formData),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        submissionKey.reset();
        setMessage({ ok: true, text: result.message })
        setTimeout(() => router.push('/inventory/movement'), 1500)
      } else {
        setMessage({ ok: false, text: result.error || 'Failed to adjust stock' })
      }
    } catch {
      setMessage({ ok: false, text: 'Network error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const label = isSubmitting ? 'Saving…' : changes.length ? `Save ${changes.length} change${changes.length > 1 ? 's' : ''}` : 'Nothing to save'

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 pb-24 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-[18px] lg:pb-0">
      <Card title="What you counted" right={<span className="text-xs font-normal text-[#a1a1aa]">change only what is different</span>}>
        <div className="px-4 lg:px-[18px]">
          {products.map((p, i) => {
            const from = currentInventory[p.key] ?? 0
            const to = formData[p.key] === '' ? null : Number(formData[p.key])
            const diff = to === null ? 0 : to - from
            return (
              <div key={p.key} className="grid grid-cols-[1fr_140px] items-center gap-x-3 gap-y-1 border-t border-[#f3f1ed] py-3 first:border-t-0 lg:grid-cols-[1.3fr_100px_160px_110px]">
                <label htmlFor={`final-${p.key}`} className="flex items-center gap-2 font-semibold">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                  {p.label}
                </label>
                <div className="col-start-1 row-start-2 text-[13px] text-[#52525b] lg:col-start-auto lg:row-start-auto">
                  System <b className="tabular-nums text-[#18181b]">{from}</b>
                </div>
                <div className="col-start-2 row-span-2 row-start-1 flex h-11 overflow-hidden rounded-[10px] border border-[#ebe8e3] bg-white lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                  <button type="button" onClick={() => step(p.key, -1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One less ${p.label}`}>−</button>
                  <input
                    id={`final-${p.key}`}
                    inputMode="numeric"
                    value={formData[p.key] ?? ''}
                    onChange={(e) => set(p.key, e.target.value)}
                    className="min-w-0 flex-1 text-center text-base font-bold tabular-nums outline-none"
                  />
                  <button type="button" onClick={() => step(p.key, 1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One more ${p.label}`}>+</button>
                </div>
                <div className={cx('col-span-2 text-[13px] font-bold tabular-nums lg:col-span-1', diff < 0 ? 'text-[#b91c1c]' : diff > 0 ? 'text-[#15803d]' : 'text-[#a1a1aa]')}>
                  {diff === 0 ? 'no change' : `${from} → ${to} (${diff > 0 ? '+' : ''}${diff})`}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        <Message message={message} />
        <Note tone={changes.length ? 'amber' : 'gray'}>
          {changes.length ? (
            <>
              <b>{changes.length} product{changes.length > 1 ? 's' : ''} change:</b>{' '}
              {changes.map((c) => `${c.p.label} ${(c.to ?? 0) - c.from > 0 ? '+' : ''}${(c.to ?? 0) - c.from}`).join(', ')}
            </>
          ) : (
            'Nothing changed yet. Use − / + or type the number you counted.'
          )}
        </Note>
        <button type="submit" disabled={isSubmitting || changes.length === 0} className="a-btn a-btn-lg a-btn-pri hidden lg:inline-flex">
          {label}
        </button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ebe8e3] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button type="submit" disabled={isSubmitting || changes.length === 0} className="a-btn a-btn-lg a-btn-pri w-full">
          {label}
        </button>
      </div>
    </form>
  )
}
