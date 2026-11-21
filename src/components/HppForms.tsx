'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MEATS, MEAT_LABELS, type Meat } from '@/lib/core/meat'
import RupiahInput from './RupiahInput'
import { selectClass, selectStyle } from './selectStyle'

const field = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-3 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]'
const saveButton = 'bg-[#9a3412] text-white rounded-lg px-5 py-3 font-semibold hover:bg-[#7c2d12] disabled:opacity-50'

/** POST /api/hpp, then refresh the page. Returns an error message or null. */
function useHppAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const run = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fetch('/api/hpp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await r.json().catch(() => ({}))
      if (r.ok && result.success) {
        setMessage({ ok: true, text: okText })
        router.refresh()
        return true
      }
      setMessage({ ok: false, text: result.error || 'Failed to save' })
    } catch {
      setMessage({ ok: false, text: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
    }
    return false
  }
  return { busy, message, run, clear: () => setMessage(null) }
}

function Message({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null
  return <p className={`text-sm font-medium ${m.ok ? 'text-green-700' : 'text-red-700'}`}>{m.text}</p>
}

/** Meat price added by hand: for a production entered without a price, or a correction. */
export function MeatPriceForm({ today }: { today: string }) {
  const [v, setV] = useState({ purchaseDate: today, meat: 'babi' as Meat, price: '', packs: '' })
  const { busy, message, run, clear } = useHppAction()
  const set = (patch: Partial<typeof v>) => { setV((prev) => ({ ...prev, ...patch })); clear() }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await run({ action: 'meat', ...v, packs: Number(v.packs) }, 'Meat price added')) setV((prev) => ({ ...prev, price: '', packs: '' }))
      }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="mp-date" className="block text-xs font-medium text-gray-600 mb-1">Date</label>
          <input id="mp-date" type="date" required max={today} value={v.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} className={field} />
        </div>
        <div>
          <label htmlFor="mp-meat" className="block text-xs font-medium text-gray-600 mb-1">Meat</label>
          <select id="mp-meat" value={v.meat} onChange={(e) => set({ meat: e.target.value as Meat })} className={`${field} ${selectClass}`} style={selectStyle}>
            {MEATS.map((m) => <option key={m} value={m}>{MEAT_LABELS[m]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mp-price" className="block text-xs font-medium text-gray-600 mb-1">Price</label>
          <RupiahInput id="mp-price" required value={v.price} onChange={(price) => set({ price })} placeholder="2.635.000" />
        </div>
        <div>
          <label htmlFor="mp-packs" className="block text-xs font-medium text-gray-600 mb-1">Packs made</label>
          <input id="mp-packs" type="number" inputMode="numeric" min="1" step="1" required value={v.packs} onChange={(e) => set({ packs: e.target.value })} className={field} placeholder="40" />
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={busy} className={saveButton}>{busy ? 'Saving…' : 'Add meat price'}</button>
        <Message m={message} />
      </div>
    </form>
  )
}

export interface SettingField { key: string; label: string; value: number; rupiah: boolean }

export function CostSettingsForm({ fields }: { fields: SettingField[] }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, String(f.value)])))
  const { busy, message, run, clear } = useHppAction()
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); await run({ action: 'settings', ...v }, 'Settings saved') }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`set-${f.key}`} className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
            {f.rupiah ? (
              <RupiahInput id={`set-${f.key}`} required value={v[f.key]} onChange={(d) => { setV((p) => ({ ...p, [f.key]: d || '0' })); clear() }} />
            ) : (
              <input id={`set-${f.key}`} type="number" inputMode="decimal" min="0" step="any" required value={v[f.key]} onChange={(e) => { setV((p) => ({ ...p, [f.key]: e.target.value })); clear() }} className={field} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={busy} className={saveButton}>{busy ? 'Saving…' : 'Save settings'}</button>
        <Message m={message} />
      </div>
    </form>
  )
}

/** One recipe: amount of each ingredient per kg of meat. */
export function RecipeForm({ recipe, ingredients, amounts, isNew = false }: { recipe: string; ingredients: { key: string; name: string; unit: string }[]; amounts: Record<string, number>; isNew?: boolean }) {
  const [name, setName] = useState(recipe)
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(ingredients.map((i) => [i.key, amounts[i.key] ? String(amounts[i.key]) : ''])))
  const { busy, message, run, clear } = useHppAction()
  return (
    <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await run({ action: 'recipe', recipe: name, amounts: v }, 'Recipe saved') && isNew) { setName(''); setV({}) } }}>
      {isNew ? (
        <div>
          <label htmlFor="new-recipe" className="block text-xs font-medium text-gray-600 mb-1">New recipe name</label>
          <input id="new-recipe" required value={name} onChange={(e) => { setName(e.target.value); clear() }} className={`${field} sm:max-w-xs`} placeholder="e.g. Pedas" />
        </div>
      ) : (
        <h3 className="text-lg font-bold text-gray-900">{recipe}</h3>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ingredients.map((i) => (
          <div key={i.key}>
            <label htmlFor={`r-${name}-${i.key}`} className="block text-xs font-medium text-gray-600 mb-1">{i.name} ({i.unit === 'ml' ? 'ml' : 'gram'} per kg)</label>
            <input id={`r-${name}-${i.key}`} type="number" inputMode="decimal" min="0" step="any" value={v[i.key] ?? ''} onChange={(e) => { setV((p) => ({ ...p, [i.key]: e.target.value })); clear() }} className={field} placeholder="0" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="submit" disabled={busy} className={saveButton}>{busy ? 'Saving…' : 'Save recipe'}</button>
        <Message m={message} />
      </div>
    </form>
  )
}
