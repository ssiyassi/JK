// 2026-10-23, owner's choice (option C): stop showing the ads in Jakarta Selatan, Jakarta Timur and Depok.
// Keeps the rest of the ad set's targeting as it is. Run: node scripts/meta-geo-exclude-oct26.mjs
import { get, post } from './meta-api.mjs';

const ADSET = '120250051623620619';
const DEPOK = '957890';
const EXCLUDE = { subcities: [{ key: '2727916' }, { key: '2998931' }], cities: [{ key: DEPOK }] }; // South Jakarta, East Jakarta, Depok

const { targeting } = await get(ADSET, { fields: 'targeting' });
const geo = targeting.geo_locations;
geo.cities = (geo.cities || []).filter((c) => c.key !== DEPOK).map(({ key, radius, distance_unit }) => (radius ? { key, radius, distance_unit } : { key }));
const next = { ...targeting, geo_locations: geo, excluded_geo_locations: EXCLUDE };
await post(ADSET, { targeting: next });

const after = await get(ADSET, { fields: 'targeting{geo_locations,excluded_geo_locations,age_min,age_max},effective_status' });
console.log(JSON.stringify({ include: after.targeting.geo_locations, exclude: after.targeting.excluded_geo_locations, status: after.effective_status }, null, 1));
