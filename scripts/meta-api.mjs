// Tiny Meta Graph API helper for laptop scripts; reads the token from .meta-ads-token and never prints it.
import { readFileSync } from 'node:fs';

const token = () => readFileSync(new URL('../.meta-ads-token', import.meta.url), 'utf8').trim();
export const GRAPH = 'https://graph.facebook.com/v23.0';
export const AD_ACCOUNT = 'act_993257963827130';
export const PIXEL_ID = '640518473594074';
export const PAGE_ID = '455033115042085';
export const IG_USER_ID = '17841401644118096';

async function handle(res) {
  const body = await res.json();
  if (body.error) {
    const e = body.error;
    throw new Error(`${e.message}${e.error_user_title ? ` | ${e.error_user_title}: ${e.error_user_msg}` : ''} (code ${e.code}/${e.error_subcode ?? '-'})`);
  }
  return body;
}

export async function get(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token() });
  return handle(await fetch(`${GRAPH}/${path}?${qs}`));
}

/** POST form fields; objects/arrays are sent as JSON strings (Graph API convention). */
export async function post(path, fields = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v instanceof Blob) form.append(k, v, k === 'source' ? 'video.mp4' : 'file');
    else form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  form.append('access_token', token());
  return handle(await fetch(`${GRAPH}/${path}`, { method: 'POST', body: form }));
}
