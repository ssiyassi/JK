// Past customers (owner's list, 2026-10-31) as a Meta customer-list audience, for the "Diskon 35% pembelian pertama
// di website" retargeting: none of them has ordered on the website yet. The list itself stays on the laptop
// (private/meta-customer-list.csv, never committed); only SHA-256 hashes of the normalised phone / name / city are
// sent to Meta, which matches them to Facebook / Instagram accounts.
// Run: node scripts/meta-customer-list.mjs [check]
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, post } from './meta-api.mjs';

const STATE = new URL('../marketing/campaigns/customers-oct26.json', import.meta.url);
const LIST = new URL('../private/meta-customer-list.csv', import.meta.url);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
const sha = (v) => (v ? createHash('sha256').update(v).digest('hex') : '');

if (!state.audience) {
  const res = await post(`${AD_ACCOUNT}/customaudiences`, {
    name: 'Past customers — owner list (Okt 2026)',
    description: 'Owner customer list 2026-10-31, never ordered on the website',
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
  });
  state.audience = res.id;
  save();
  console.log('+ audience', res.id);
}

if (process.argv[2] !== 'check' && !state.uploaded) {
  // phone,fn,ln,ct,country — already normalised (phone +62…, lower-case letters only)
  const rows = readFileSync(LIST, 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  const data = rows.map(([phone, fn, ln, ct, country]) => [sha(phone.replace(/\D/g, '')), sha(fn), sha(ln), sha(ct), sha(country)]);
  const res = await post(`${state.audience}/users`, {
    payload: { schema: ['PHONE', 'FN', 'LN', 'CT', 'COUNTRY'], data },
  });
  state.uploaded = { rows: data.length, received: res.num_received, invalid: res.num_invalid_entries, at: new Date().toISOString() };
  save();
  console.log('+ uploaded', JSON.stringify(state.uploaded));
}

const a = await get(state.audience, { fields: 'name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status' });
console.log(JSON.stringify(a));
