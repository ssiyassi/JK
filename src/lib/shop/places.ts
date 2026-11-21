// Address search for the delivery pin at checkout: Google Places API (New), called from the server so the key
// (secret GOOGLE_PLACES_API_KEY) never reaches the browser. Autocomplete + one details lookup share a session token,
// and details only asks for location + formattedAddress (the cheaper "Essentials" fields). Framework-free.
import { AppError } from '../core/d1.ts';

const API = 'https://places.googleapis.com/v1';
// Results lean towards Jakarta (radius is Google's maximum); only addresses in Indonesia are suggested.
const BIAS = { circle: { center: { latitude: -6.2, longitude: 106.816666 }, radius: 50000 } };
export const MIN_SEARCH_CHARS = 3;

export type PlacesFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface PlaceSuggestion {
  placeId: string;
  main: string; // e.g. "Taman Anggrek Residence"
  secondary: string; // e.g. "Jl. Letjen S. Parman, Jakarta Barat"
}

export interface PlaceLocation {
  latitude: number;
  longitude: number;
  address: string;
}

function sessionToken(value: unknown): string {
  const token = typeof value === 'string' ? value : '';
  // Google accepts URL-safe base64 up to 36 characters; the browser sends a UUID.
  if (!/^[A-Za-z0-9_-]{8,36}$/.test(token)) throw new AppError(400, 'Permintaan tidak valid');
  return token;
}

async function call<T>(fetchFn: PlacesFetch, url: string, init: RequestInit): Promise<T> {
  const res = await fetchFn(url, init);
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

export async function autocompletePlaces(key: string, body: Record<string, unknown>, fetchFn: PlacesFetch): Promise<PlaceSuggestion[]> {
  const input = (typeof body.input === 'string' ? body.input : '').trim().slice(0, 120);
  const token = sessionToken(body.sessionToken);
  if (input.length < MIN_SEARCH_CHARS) return [];
  const data = await call<{ suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }[] }>(
    fetchFn,
    `${API}/places:autocomplete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ input, sessionToken: token, includedRegionCodes: ['id'], languageCode: 'id', locationBias: BIAS }),
    },
  );
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p?.placeId))
    .slice(0, 5)
    .map((p) => ({
      placeId: p.placeId!,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export async function placeLocation(key: string, body: Record<string, unknown>, fetchFn: PlacesFetch): Promise<PlaceLocation> {
  const placeId = typeof body.placeId === 'string' ? body.placeId : '';
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) throw new AppError(400, 'Permintaan tidak valid');
  const token = sessionToken(body.sessionToken);
  const data = await call<{ location?: { latitude?: number; longitude?: number }; formattedAddress?: string }>(
    fetchFn,
    `${API}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(token)}&languageCode=id`,
    { method: 'GET', headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'location,formattedAddress' } },
  );
  const { latitude, longitude } = data.location ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') throw new AppError(404, 'Lokasi tidak ditemukan');
  return { latitude, longitude, address: data.formattedAddress ?? '' };
}
