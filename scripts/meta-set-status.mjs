// Switches Meta objects on or off: node scripts/meta-set-status.mjs ACTIVE|PAUSED <id> [<id> ...]
// Only ever run with the owner's explicit "go" (ACTIVE) in chat. Prints each object's status afterwards.
import { get, post } from './meta-api.mjs';

const [status, ...ids] = process.argv.slice(2);
if (!['ACTIVE', 'PAUSED'].includes(status) || !ids.length) throw new Error('usage: ACTIVE|PAUSED <id> [<id> ...]');
for (const id of ids) await post(id, { status });
for (const id of ids) {
  const o = await get(id, { fields: 'name,status,effective_status' });
  console.log(`${o.name} | ${o.status} | ${o.effective_status}`);
}
