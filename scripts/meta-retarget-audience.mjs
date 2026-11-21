// Experiment 3 (owner approved 2026-10-27): audience of website visitors in the last 14 days who did NOT buy (Pixel
// PageView minus Purchase). Creating it spends nothing; the retargeting ad set (Rp 15.000/day, main ad set → Rp 55.000/day)
// starts only once Meta reports ≥ 100 people. Run: node scripts/meta-retarget-audience.mjs [check]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_ACCOUNT, get, PIXEL_ID, post } from './meta-api.mjs';

const STATE = new URL('../marketing/campaigns/retarget-oct26.json', import.meta.url);
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const pixelRule = (event) => ({
  event_sources: [{ id: PIXEL_ID, type: 'pixel' }],
  retention_seconds: 14 * 86400,
  filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: event }] },
});

if (!state.audience) {
  const res = await post(`${AD_ACCOUNT}/customaudiences`, {
    name: 'Website visitors 14d — not purchased',
    description: 'Retargeting experiment (owner approved 2026-10-27)',
    prefill: true,
    rule: { inclusions: { operator: 'or', rules: [pixelRule('PageView')] }, exclusions: { operator: 'or', rules: [pixelRule('Purchase')] } },
  });
  state.audience = res.id;
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
  console.log('+ audience', res.id);
}
const a = await get(state.audience, { fields: 'name,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status' });
console.log(JSON.stringify(a));
