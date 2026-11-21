'use client';

import { useState } from 'react';

export default function CopyButton({
  text,
  label = 'Salin',
  icon,
  className = 'text-sm font-medium text-[#9a3412] px-2 py-1 rounded hover:bg-[#fdf3ea]',
}: {
  text: string;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // Older phone browsers: fall back to a hidden text box.
          const box = document.createElement('textarea');
          box.value = text;
          box.style.position = 'fixed';
          box.style.opacity = '0';
          document.body.appendChild(box);
          box.select();
          const ok = document.execCommand('copy');
          box.remove();
          if (!ok) return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={className}
    >
      {icon}
      {copied ? 'Tersalin ✓' : label}
    </button>
  );
}
