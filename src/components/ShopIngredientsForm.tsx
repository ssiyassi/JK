'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, TrashIcon, ShoppingCartIcon } from '@heroicons/react/24/outline'
import type { Ingredient } from '@/lib/core/costs'
import RupiahInput from './RupiahInput'
import { selectClass, selectStyle } from './selectStyle'

type Row = { ingredient: string; size: string; price: string }
const emptyRow = (): Row => ({ ingredient: '', size: '', price: '' })

// One shopping trip: the date, then one row per ingredient bought. "Add row" adds more rows.
export default function ShopIngredientsForm({ ingredients, today }: { ingredients: Ingredient[]; today: string }) {
  const [shopDate, setShopDate] = useState(today)
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()
  const unitOf = (key: string) => ingredients.find((i) => i.key === key)?.unit ?? ''

  const update = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    if (message) setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)
    try {
      const response = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDate, items: rows }),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        setMessage({ type: 'success', text: result.message })
        setRows([emptyRow()])
        router.refresh()
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const field = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]'

  return (
    <div className="a-card p-4 lg:p-[18px] text-gray-900">
      <div className="mb-5 sm:mb-8">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Shop Ingredients</h2>
        <p className="text-gray-600">Fill in what you bought. The newest price of each ingredient becomes its base price.</p>
      </div>

      {message && (
        <div className={`mb-5 p-4 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-100 border border-green-200 text-green-800' : 'bg-red-100 border border-red-200 text-red-800'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="shopDate" className="block text-sm font-medium text-gray-700 mb-2">Date of shop</label>
          <input id="shopDate" type="date" required max={today} value={shopDate} onChange={(e) => setShopDate(e.target.value)} className={`${field} sm:max-w-xs`} />
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="bg-[#fdf3ea] border border-[#f6dcc4] rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[#3b1a0c]">Item {i + 1}</span>
                {rows.length > 1 && (
                  <button type="button" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))} className="-m-2 p-2 text-red-600 hover:text-red-800" aria-label={`Remove item ${i + 1}`}>
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor={`ing-${i}`} className="block text-xs font-medium text-gray-600 mb-1">Ingredient</label>
                  <select id={`ing-${i}`} required value={r.ingredient} onChange={(e) => update(i, { ingredient: e.target.value })} className={`${field} ${selectClass}`} style={selectStyle}>
                    <option value="">Choose…</option>
                    {ingredients.map((ing) => <option key={ing.key} value={ing.key}>{ing.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`size-${i}`} className="block text-xs font-medium text-gray-600 mb-1">Size</label>
                  <input id={`size-${i}`} type="number" inputMode="decimal" min="0" step="any" required placeholder="e.g. 2000" value={r.size} onChange={(e) => update(i, { size: e.target.value })} className={field} />
                </div>
                <div>
                  <span className="block text-xs font-medium text-gray-600 mb-1">Units</span>
                  <div className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-3 text-gray-700">{unitOf(r.ingredient) || '—'}</div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor={`price-${i}`} className="block text-xs font-medium text-gray-600 mb-1">Price</label>
                  <RupiahInput id={`price-${i}`} required value={r.price} onChange={(v) => update(i, { price: v })} placeholder="e.g. 49.800" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button type="button" onClick={() => setRows((prev) => [...prev, emptyRow()])} className="w-full border-2 border-dashed border-[#f6dcc4] text-[#9a3412] rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-[#fdf3ea] font-medium">
          <PlusIcon className="h-5 w-5" /> Add row
        </button>

        <button type="submit" disabled={isSubmitting} className="w-full bg-[#9a3412] text-white px-8 py-4 rounded-lg flex items-center justify-center space-x-2 hover:bg-[#7c2d12] transition-colors text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
          <ShoppingCartIcon className="w-5 h-5" />
          <span>{isSubmitting ? 'Saving…' : 'Save Shopping'}</span>
        </button>
      </form>
    </div>
  )
}
