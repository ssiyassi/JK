'use client'

// Rupiah amount field: digits only, shown with thousand dots (1.700.000). The value passed around is digits only.
export default function RupiahInput({
  id,
  value,
  onChange,
  placeholder,
  required,
  className = '',
}: {
  id?: string
  value: string
  onChange: (digits: string) => void
  placeholder?: string
  required?: boolean
  className?: string
}) {
  const shown = value ? Number(value).toLocaleString('id-ID') : ''
  return (
    <div className={`flex items-center bg-white border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-orange-400 ${className}`}>
      <span className="pl-3 text-gray-500 text-sm">Rp</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        required={required}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12))}
        className="w-full min-w-0 bg-transparent px-2 py-3 text-gray-900 placeholder-gray-500 focus:outline-none"
      />
    </div>
  )
}
