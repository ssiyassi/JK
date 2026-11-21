'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LockClosedIcon } from '@heroicons/react/24/outline'

// Shown instead of the HPP pages until the emailed code is entered.
export default function HppLockScreen({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const router = useRouter()

  // While the owner waits for the code: read the latest ad spend now, so the page opens fast after unlocking.
  useEffect(() => {
    fetch('/api/hpp/warm').catch(() => {})
  }, [])

  const call = async (body: Record<string, unknown>) => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fetch('/api/hpp/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await r.json().catch(() => ({}))
      if (r.ok && result.success) return true
      setMessage({ ok: false, text: result.error || 'Something went wrong' })
    } catch {
      setMessage({ ok: false, text: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
    }
    return false
  }

  const send = async () => {
    if (await call({ action: 'send' })) {
      setSent(true)
      setCode('')
      setMessage({ ok: true, text: `Code sent to ${email}. Check your inbox (and spam).` })
    }
  }

  return (
    <div className="a-card p-5 sm:p-8 max-w-md mx-auto text-gray-900">
      <div className="w-12 h-12 rounded-full bg-[#fbe7d3] flex items-center justify-center mb-4">
        <LockClosedIcon className="h-6 w-6 text-[#9a3412]" />
      </div>
      <h2 className="text-xl font-bold mb-2">HPP &amp; Profit is locked</h2>
      <p className="text-gray-600 mb-5">We email a 6-digit code to <b className="text-gray-900">{email}</b>. The code opens these pages on this device for 12 hours.</p>

      {sent && (
        <form
          className="space-y-3 mb-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await call({ action: 'verify', code })) router.refresh()
          }}
        >
          <label htmlFor="hpp-code" className="block text-sm font-medium text-gray-700">Code</label>
          <input
            id="hpp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            required
            value={code}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setMessage(null) }}
            className="w-full bg-white border border-gray-300 rounded-lg px-3 py-3 text-2xl tracking-[0.5em] text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#f6dcc4]"
            placeholder="••••••"
          />
          <button type="submit" disabled={busy || code.length !== 6} className="w-full bg-[#9a3412] text-white rounded-lg px-5 py-3 font-semibold hover:bg-[#7c2d12] disabled:opacity-50">
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={send}
        disabled={busy}
        className={sent ? 'w-full text-[#9a3412] font-medium py-2 hover:underline disabled:opacity-50' : 'w-full bg-[#9a3412] text-white rounded-lg px-5 py-3 font-semibold hover:bg-[#7c2d12] disabled:opacity-50'}
      >
        {sent ? 'Send a new code' : busy ? 'Sending…' : 'Email me a code'}
      </button>

      {message && <p className={`mt-3 text-sm font-medium ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
    </div>
  )
}

/** Header button: locks the HPP pages again on this device. */
export function HppLockButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await fetch('/api/hpp/otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'lock' }) }).catch(() => null)
        router.refresh()
        setBusy(false)
      }}
      className="bg-gray-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 hover:bg-gray-800 font-medium disabled:opacity-50"
    >
      <LockClosedIcon className="h-5 w-5" /> Lock
    </button>
  )
}
