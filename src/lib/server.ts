// Server-only glue between Next.js route handlers / pages and the framework-free core in ./core.
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse, type NextRequest } from 'next/server';
import { AppError, type D1Database } from './core/d1';

/** The D1 database bound as "DB" in wrangler.jsonc (local, preview or production). */
export function getDB(): D1Database {
  const env = getCloudflareContext().env as unknown as { DB?: D1Database };
  if (!env.DB) throw new Error('D1 binding "DB" is not configured (see wrangler.jsonc)');
  return env.DB;
}

/** Structured JSON logs: visible in Cloudflare dashboard > Workers > jentis-kitchen > Logs. */
export function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Email of the signed-in person (set by middleware after verifying Cloudflare Access). */
export function actor(request: NextRequest | Request): string {
  return request.headers.get('x-jentis-user') || 'unknown';
}

/** Client-generated key that makes a submission safe to retry. Optional; ignored if malformed. */
export function idempotencyKey(request: NextRequest | Request): string | null {
  const key = request.headers.get('idempotency-key');
  return key && /^[A-Za-z0-9-]{8,100}$/.test(key) ? key : null;
}

/**
 * Largest JSON body accepted (8 MB). The biggest real ones are two resized images (banner desktop + phone, promo photo
 * + thumbnail: about 3.6 MB); anything far larger is refused before it is read, so nobody can tie up the Worker's memory.
 */
export const MAX_JSON_BYTES = 8 * 1024 * 1024;

export async function readJson(request: NextRequest | Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_BYTES) throw new AppError(413, 'Request too large');
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new AppError(400, 'Request body must be a JSON object');
}

/**
 * Turns errors into responses. Expected errors (AppError) keep their message, as the forms display it.
 * Unexpected errors are logged in full but only a generic message is sent to the browser.
 */
export function errorResponse(error: unknown, publicMessage: string, context: Record<string, unknown> = {}) {
  if (error instanceof AppError) {
    if (error.status >= 500) log('error', 'app_error', { ...context, message: error.message });
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  log('error', 'unexpected_error', {
    ...context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}
