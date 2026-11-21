// Loads the owner's past-customer list (private/rows.json from "Claude Customer Data Feed.xlsx", never committed) into
// past_customers for the project report and the customer list in Ads Report (src/lib/marketing/pastCustomers.ts):
// phone hash + name, phone and city (no addresses). Writes private/past-customers.sql; apply it with:
//   npx wrangler d1 execute jentis-db-prod --remote --env="" --file=private/past-customers.sql
// Run: node scripts/past-customers-load.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { hashPhone, PAST_CUSTOMERS, phone628 } from '../src/lib/marketing/pastCustomers.ts';

const ROOT = new URL('../', import.meta.url);
// Delivery area (same as the ads): Jakarta, Depok, Tangerang (+ Selatan), Bekasi, Surabaya
const AREA = /^(jakarta|depok|tangerang|bekasi|surabaya)/;

// Columns of the sheet: A name, B address (not loaded), C city, D phone without the leading 0 (Excel number, e.g. 8.15980441E9)
const rows = (JSON.parse(readFileSync(new URL('private/rows.json', ROOT), 'utf8')) as Record<string, string>[]).slice(1);
const sq = (v: string) => `'${v.replace(/'/g, "''")}'`;
const now = Date.now();
const seen = new Set<string>();
const values: string[] = [];
let inArea = 0;
for (const r of rows) {
  const n = Number(r.D);
  const p = phone628(Number.isFinite(n) && n > 0 ? String(Math.round(n)) : (r.D ?? ''));
  if (!p || p.length < 11 || seen.has(p)) continue; // too short to be a real mobile number (2 rows)
  seen.add(p);
  const city = (r.C ?? '').trim().replace(/\s+/g, ' ');
  const area = AREA.test(city.toLowerCase()) ? 1 : 0;
  inArea += area;
  const name = (r.A ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  values.push(`(${sq(await hashPhone(p))}, ${sq(PAST_CUSTOMERS.key)}, ${area}, ${now}, ${sq(name)}, ${sq(p)}, ${sq(city.slice(0, 40))})`);
}
const sql = values
  .map((v) => `INSERT INTO past_customers (phoneHash, project, inArea, addedAt, name, phone, city) VALUES ${v} ON CONFLICT(phoneHash) DO UPDATE SET name = excluded.name, phone = excluded.phone, city = excluded.city;`)
  .join('\n');
writeFileSync(new URL('private/past-customers.sql', ROOT), `${sql}\n`);
console.log(`${values.length} customers (${inArea} in the delivery area) → private/past-customers.sql`);
