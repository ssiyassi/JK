'use client';

import { useState } from 'react';
import { CheckIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';

/** Small icon button that copies `value` (e.g. an address or phone number) and shows a tick for a moment. */
export default function CopyValueButton({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older phone browsers: fall back to a hidden text box.
      const box = document.createElement('textarea');
      box.value = value;
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      document.execCommand('copy');
      box.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `Copy ${label}`}
      aria-label={copied ? 'Copied' : `Copy ${label}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-1 transition-colors ${
        copied ? 'text-green-600' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'
      } ${className}`}
    >
      {copied ? <CheckIcon className="h-4 w-4" /> : <DocumentDuplicateIcon className="h-4 w-4" />}
    </button>
  );
}
