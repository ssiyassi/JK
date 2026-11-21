'use client';

import { useCallback, useRef } from 'react';

/**
 * One key per form submission. The same key is reused if the user retries after an error,
 * so the server applies the submission at most once. Call reset() after a confirmed success.
 */
export function useIdempotencyKey() {
  const ref = useRef<string | null>(null);
  const current = useCallback(() => {
    if (!ref.current) ref.current = crypto.randomUUID();
    return ref.current;
  }, []);
  const reset = useCallback(() => {
    ref.current = null;
  }, []);
  return { current, reset };
}
