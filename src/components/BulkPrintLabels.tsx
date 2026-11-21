'use client';

import { useState } from 'react';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, renderShippingLabel, type ShippingLabel } from '@/lib/shippingLabel';
import { Icon } from './admin/ui';

/** Prints several shipping labels in one go: one 100 x 120 mm page per label (OKAY D100). */
export default function BulkPrintLabels({ labels, text, className }: { labels: ShippingLabel[]; text: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function print() {
    if (!labels.length) return;
    setBusy(true);
    setError(null);
    try {
      const urls = await Promise.all(labels.map(async (l) => URL.createObjectURL(await renderShippingLabel(l))));
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) throw new Error('Could not open the print window');
      doc.open();
      doc.write(
        `<!doctype html><style>@page{size:${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;margin:0}html,body{margin:0}` +
          `img{display:block;width:${LABEL_WIDTH_MM}mm;height:${LABEL_HEIGHT_MM}mm;page-break-after:always;break-after:page}</style>` +
          urls.map((u) => `<img src="${u}">`).join(''),
      );
      doc.close();
      const imgs = [...doc.querySelectorAll('img')];
      await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)))));
      win.focus();
      win.print();
      setTimeout(() => {
        frame.remove();
        urls.forEach((u) => URL.revokeObjectURL(u));
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the labels');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={print} disabled={busy || labels.length === 0} className={className ?? 'a-btn'}>
        <Icon name="printer" className="size-4" />
        {busy ? 'Creating labels…' : text}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
