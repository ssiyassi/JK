'use client';

import { useEffect, type ReactNode } from 'react';

/** Pop-up: centred on desktop, a bottom sheet on a phone. Esc or the dim background closes it. */
export default function Modal({
  title,
  sub,
  children,
  footer,
  onClose,
}: {
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[540px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[18px]">
        <div className="mx-auto mt-2.5 h-[5px] w-[38px] rounded-full bg-[#e4e4e7] sm:hidden" />
        <div className="px-5 pt-4 sm:pt-5">
          <h2 className="text-lg font-bold">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-[#52525b]">{sub}</p>}
        </div>
        <div className="flex flex-col gap-3.5 px-5 pt-3">{children}</div>
        <div className="flex gap-2.5 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 [&>*]:flex-1">{footer}</div>
      </div>
    </div>
  );
}
