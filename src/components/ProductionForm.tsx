'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useIdempotencyKey } from '@/lib/client/useIdempotencyKey';
import type { StockProduct } from '@/lib/core/products';
import { MEATS, MEAT_LABELS, type Meat } from '@/lib/core/meat';
import RupiahInput from './RupiahInput';
import { Card, Message, Note, PRODUCT_COLORS, fmtDate } from './admin/ui';

interface ProductionFormProps {
  products: StockProduct[]
  productMeat: Record<string, Meat> // babi / sapi per product (products without one have no meat price)
  stock: Record<string, number>
}

/** Add production: boxes made per product + what the meat cost (for the HPP). */
export default function ProductionForm({ products, productMeat, stock }: ProductionFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>(() => Object.fromEntries(products.map((p) => [p.key, ''])))
  const [meatPrices, setMeatPrices] = useState<Record<Meat, string>>({ babi: '', sapi: '' })
  // Packs per meat in this production: a meat price is asked for every meat that has packs.
  const packs = Object.fromEntries(MEATS.map((m) => [m, products.reduce((t, p) => t + (productMeat[p.key] === m ? Math.max(0, parseInt(formData[p.key]) || 0) : 0), 0)])) as Record<Meat, number>
  const meatsInUse = MEATS.filter((m) => packs[m] > 0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionKey = useIdempotencyKey();
  const [message, setMessage] = useState<{ ok: boolean, text: string } | null>(null)
  const router = useRouter()
  const total = products.reduce((t, p) => t + Math.max(0, parseInt(formData[p.key]) || 0), 0)

  const set = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value.replace(/[^\d]/g, '') }))
    if (message) setMessage(null)
  }
  const step = (key: string, by: number) => set(key, String(Math.max(0, (parseInt(formData[key]) || 0) + by)))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionKey.current() },
        body: JSON.stringify({ ...formData, meatPrices: Object.fromEntries(meatsInUse.map((m) => [m, meatPrices[m]])) }),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        submissionKey.reset();
        setMessage({ ok: true, text: result.message })
        setTimeout(() => router.push('/inventory'), 1500)
      } else {
        setMessage({ ok: false, text: result.error || 'Failed to add production' })
      }
    } catch {
      setMessage({ ok: false, text: 'Network error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const label = isSubmitting ? 'Saving…' : total ? `Save production · +${total} boxes` : 'Save production'

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 pb-24 lg:grid-cols-[1.5fr_1fr] lg:items-start lg:gap-[18px] lg:pb-0">
      <Card title="Boxes made" right={<span suppressHydrationWarning className="text-xs font-normal text-[#a1a1aa]">{fmtDate(Date.now())}</span>}>
        <div className="px-4 lg:px-[18px]">
          {products.map((p, i) => (
            <div key={p.key} className="flex items-center gap-3 border-t border-[#f3f1ed] py-3 first:border-t-0">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
              <label htmlFor={`qty-${p.key}`} className="min-w-0 flex-1">
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs text-[#a1a1aa]">now {stock[p.key] ?? 0} boxes</div>
              </label>
              <div className="flex h-11 w-[150px] overflow-hidden rounded-[10px] border border-[#ebe8e3] bg-white">
                <button type="button" onClick={() => step(p.key, -1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One less ${p.label}`}>−</button>
                <input
                  id={`qty-${p.key}`}
                  inputMode="numeric"
                  placeholder="0"
                  value={formData[p.key] ?? ''}
                  onChange={(e) => set(p.key, e.target.value)}
                  className="min-w-0 flex-1 text-center text-base font-bold tabular-nums outline-none"
                />
                <button type="button" onClick={() => step(p.key, 1)} className="w-11 bg-[#f3f1ed] text-lg text-[#52525b]" aria-label={`One more ${p.label}`}>+</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <div className="flex flex-col gap-3">
        <Card title="Meat price for this batch">
          <div className="flex flex-col gap-3 p-4 lg:p-[18px]">
            {meatsInUse.length === 0 ? (
              <p className="text-sm text-[#52525b]">Enter the boxes first. A price field appears for each meat used.</p>
            ) : (
              meatsInUse.map((m) => (
                <div key={m}>
                  <label htmlFor={`meat-${m}`} className="a-label">
                    {MEAT_LABELS[m]} meat price · {packs[m]} pack{packs[m] === 1 ? '' : 's'}
                  </label>
                  <RupiahInput
                    id={`meat-${m}`}
                    required
                    value={meatPrices[m]}
                    onChange={(v) => { setMeatPrices((prev) => ({ ...prev, [m]: v })); if (message) setMessage(null) }}
                    placeholder="e.g. 1.700.000"
                  />
                </div>
              ))
            )}
            <p className="a-hint">Used for the cost per box (HPP). Only you see it.</p>
          </div>
        </Card>
        {total > 0 && (
          <Card title="Stock after saving">
            <div className="px-4 py-2.5 lg:px-[18px]">
              {products.map((p) => {
                const add = Math.max(0, parseInt(formData[p.key]) || 0)
                const now = stock[p.key] ?? 0
                return (
                  <div key={p.key} className="flex py-1 text-sm">
                    <span>{p.label}</span>
                    <span className="ml-auto tabular-nums text-[#52525b]">{now}</span>
                    <span className="mx-1.5 text-[#a1a1aa]">→</span>
                    <b className={add ? 'tabular-nums text-[#15803d]' : 'tabular-nums'}>{now + add}</b>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
        <Message message={message} />
        {total === 0 && <Note>Use − / + or type how many boxes you made.</Note>}
        <button type="submit" disabled={isSubmitting || total === 0} className="a-btn a-btn-lg a-btn-pri hidden lg:inline-flex">
          {label}
        </button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#ebe8e3] bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button type="submit" disabled={isSubmitting || total === 0} className="a-btn a-btn-lg a-btn-pri w-full">
          {label}
        </button>
      </div>
    </form>
  )
}
