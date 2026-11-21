// Read-only check of what the laptop Meta token (.meta-ads-token) can access. Never prints the token.
import { readFileSync } from 'node:fs';
const token = readFileSync(new URL('../.meta-ads-token', import.meta.url), 'utf8').trim();
const V = 'v23.0';
const ACCOUNT = 'act_993257963827130';
async function get(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`https://graph.facebook.com/${V}/${path}?${qs}`);
  const body = await res.json();
  return body.error ? { error: `${body.error.message} (code ${body.error.code})` } : body;
}
const out = {
  me: await get('me', { fields: 'id,name' }),
  permissions: await get('me/permissions'),
  adAccount: await get(ACCOUNT, { fields: 'name,currency,timezone_name,account_status,spend_cap,amount_spent,disable_reason' }),
  pixels: await get(`${ACCOUNT}/adspixels`, { fields: 'id,name' }),
  pages: await get('me/accounts', { fields: 'id,name,instagram_business_account{id,username}' }),
  igForAds: await get(`${ACCOUNT}/instagram_accounts`, { fields: 'id,username' }),
};
console.log(JSON.stringify(out, null, 2));
