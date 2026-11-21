'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { postJson, useShop } from './ShopProvider';

const JAKARTA: [number, number] = [-6.2, 106.816666];

// A plain coloured dot instead of Leaflet's default image marker (whose image paths break in bundlers).
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#9a3412;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);transform:rotate(-45deg)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

interface Suggestion {
  placeId: string;
  main: string;
  secondary: string;
}

/**
 * Address / building search above the map (Google Places through our server, shop/api/places/*). Picking a
 * suggestion moves the pin; the customer can still drag it. Suggestions and one lookup share a session token.
 */
function PlaceSearch({ onPick }: { onPick: (lat: number, lng: number, address: string) => void }) {
  const { base } = useShop();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<string | null>(null);
  const latest = useRef(0);
  // The name of the suggestion just picked (shown in the box): not searched again.
  const picked = useRef<string | null>(null);

  useEffect(() => {
    const input = query.trim();
    if (input.length < 3 || input === picked.current) {
      setSuggestions([]);
      return;
    }
    picked.current = null;
    const seq = ++latest.current;
    const timer = setTimeout(async () => {
      token.current ??= crypto.randomUUID();
      try {
        const res = await postJson<{ suggestions: Suggestion[] }>(base, '/places/autocomplete', { input, sessionToken: token.current });
        if (seq !== latest.current) return; // an older answer arriving late
        setSuggestions(res.suggestions);
        setOpen(true);
        setError(res.suggestions.length ? null : 'Alamat tidak ditemukan. Coba kata lain, atau ketuk peta.');
      } catch (err) {
        if (seq === latest.current) setError((err as Error).message);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, base]);

  async function pick(s: Suggestion) {
    setOpen(false);
    picked.current = s.main;
    setSuggestions([]);
    setQuery(s.main);
    setError(null);
    try {
      const res = await postJson<{ place: { latitude: number; longitude: number; address: string } }>(base, '/places/details', { placeId: s.placeId, sessionToken: token.current });
      // Building names (e.g. "Taman Anggrek Residence") are often missing from Google's address: put them in front.
      const address = res.place.address && !res.place.address.toLowerCase().includes(s.main.toLowerCase()) ? `${s.main}, ${res.place.address}` : res.place.address || s.main;
      onPick(res.place.latitude, res.place.longitude, address);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      token.current = null; // the next search is a new session
    }
  }

  return (
    <div className="relative mb-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length && setOpen(true)}
        onKeyDown={(e) => {
          // Enter must not submit the checkout form: it picks the first suggestion instead.
          if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestions[0]) pick(suggestions[0]);
          }
        }}
        placeholder="Cari alamat atau nama gedung"
        aria-label="Cari alamat atau nama gedung"
        autoComplete="off"
        className="w-full rounded-xl border border-[#d9cabd] bg-white px-4 py-3 text-base text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#9a3412]"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[1000] rounded-xl border border-[#e5e7eb] bg-white shadow-lg overflow-hidden">
          <ul>
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button type="button" onClick={() => pick(s)} className="w-full text-left px-4 py-2.5 hover:bg-[#fdf3ea]">
                  <span className="block text-sm font-semibold text-[#111827]">{s.main}</span>
                  {s.secondary && <span className="block text-xs text-[#6b7280]">{s.secondary}</span>}
                </button>
              </li>
            ))}
          </ul>
          {/* Required by Google when Places results are shown without a Google map. */}
          <p className="px-4 py-1.5 text-right text-[11px] text-[#6b7280] border-t border-[#f3f4f6]">Powered by Google</p>
        </div>
      )}
      {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
    </div>
  );
}

export default function PinPicker({
  latitude,
  longitude,
  onChange,
  onAddress,
  search = false,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Show the address search above the map. */
  search?: boolean;
  /** The address of the search result the customer picked. */
  onAddress?: (address: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const place = (lat: number, lng: number, zoom?: number) => {
    if (!map.current) return;
    if (!marker.current) {
      marker.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map.current);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        onChangeRef.current(p.lat, p.lng);
      });
    } else {
      marker.current.setLatLng([lat, lng]);
    }
    if (zoom) map.current.setView([lat, lng], zoom);
    onChangeRef.current(lat, lng);
  };

  useEffect(() => {
    if (!container.current || map.current) return;
    const hasPin = latitude !== null && longitude !== null;
    map.current = L.map(container.current, { scrollWheelZoom: false }).setView(hasPin ? [latitude!, longitude!] : JAKARTA, hasPin ? 17 : 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current);
    if (hasPin) place(latitude!, longitude!);
    map.current.on('click', (e: L.LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
    return () => {
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; later pin changes come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError('Browser tidak mendukung lokasi. Ketuk peta untuk memilih titik.');
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        place(pos.coords.latitude, pos.coords.longitude, 17);
        setLocating(false);
      },
      () => {
        setGeoError('Lokasi tidak bisa diambil. Ketuk peta untuk memilih titik.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      {search && (
        <PlaceSearch
          onPick={(lat, lng, address) => {
            place(lat, lng, 17);
            onAddress?.(address);
          }}
        />
      )}
      <div ref={container} className="h-64 rounded-lg overflow-hidden border border-[#d9cabd] z-0" />
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-xs text-[#8a7a6d]">Ketuk peta atau geser pin ke lokasi rumah Anda.</p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="shrink-0 text-sm font-medium text-[#9a3412] disabled:opacity-50"
        >
          {locating ? 'Mencari…' : 'Lokasi saya'}
        </button>
      </div>
      {geoError && <p className="text-xs text-red-700 mt-1">{geoError}</p>}
      {latitude !== null && longitude !== null && (
        <p className="text-xs text-green-700 mt-1">
          Titik tersimpan: {latitude.toFixed(5)}, {longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}
