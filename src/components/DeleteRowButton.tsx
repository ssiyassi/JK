'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon } from '@heroicons/react/24/outline'

// Small delete button for a history row (asks first, then refreshes the page).
export default function DeleteRowButton({ url, confirmText }: { url: string; confirmText: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Delete"
      className="-m-2 p-2 text-gray-400 hover:text-red-600 disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm(confirmText)) return
        setBusy(true)
        try {
          const r = await fetch(url, { method: 'DELETE' })
          if (!r.ok) window.alert((await r.json().catch(() => ({}))).error || 'Failed to delete')
          router.refresh()
        } finally {
          setBusy(false)
        }
      }}
    >
      <TrashIcon className="h-5 w-5" />
    </button>
  )
}
