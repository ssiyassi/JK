'use client';

import { useEffect, useState } from 'react';
import { PrinterIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, renderShippingLabel, type ShippingLabel } from '@/lib/shippingLabel';

const BUTTON = 'px-3 py-2 sm:py-1 bg-gray-900 text-white text-sm rounded-lg hover:bg-black disabled:opacity-50 flex items-center space-x-1';

/**
 * "Print Label": draws the order's 100 x 120 mm label (OKAY D100) and shows it in a pop-up. On a computer with the
 * printer's USB driver, "Print" prints it at exactly 100 x 120 mm; on a phone, "Save / Share image" hands it to the
 * printer app.
 */
export default function PrintLabelButton({
  label,
  fileName,
  className = BUTTON,
  text = 'Print Label',
}: {
  label: ShippingLabel;
  fileName: string;
  className?: string;
  /** Button text; an empty string shows only the printer icon. */
  text?: string;
}) {
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const blob = await renderShippingLabel(label);
      const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
      setImage({ url: URL.createObjectURL(blob), file });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the label');
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!image) return;
    const a = document.createElement('a');
    a.href = image.url;
    a.download = image.file.name;
    a.click();
  }

  /** Prints the image alone on a 100 x 120 mm page (choose the D100 and that paper size in the print dialog). */
  function print() {
    if (!image) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) return;
    doc.open();
    doc.write(
      `<!doctype html><style>@page{size:${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm;margin:0}html,body{margin:0}` +
        `img{display:block;width:${LABEL_WIDTH_MM}mm;height:${LABEL_HEIGHT_MM}mm}</style><img src="${image.url}">`,
    );
    doc.close();
    const img = doc.querySelector('img');
    const go = () => {
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 1000);
    };
    if (img && !img.complete) img.onload = go;
    else go();
  }

  async function share() {
    if (!image) return;
    if (navigator.canShare?.({ files: [image.file] })) {
      try {
        await navigator.share({ files: [image.file] });
      } catch {
        // closed the share sheet
      }
    } else {
      download();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={className}
        aria-label={text || 'Print label'}
        title="Print label" 
      >
        <PrinterIcon className="h-4 w-4 shrink-0" />
        {text !== '' && <span>{busy ? 'Creating…' : text}</span>}
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
      {image && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setImage(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Shipping label · 10 × 12 cm</h3>
              <button type="button" onClick={() => setImage(null)} className="text-gray-500 hover:text-gray-900" aria-label="Close">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="Shipping label" className="mx-auto max-h-[55vh] w-auto border border-gray-200" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={print} className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                Print
              </button>
              <button type="button" onClick={share} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                Save / Share image
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              Computer (USB): Print → printer OKAY D100, paper 100 × 120 mm, scale 100%, no margins.
              Phone: Save / Share image → open it in the printer app with label size 100 × 120 mm.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
