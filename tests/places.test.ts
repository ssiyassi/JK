// Checkout address search (Google Places API New), with a fake Google. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autocompletePlaces, placeLocation } from '../src/lib/shop/places.ts';

function fakeGoogle(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { calls, fetchFn };
}

const token = '3f2b8c1e-5d4a-4c7b-9e2f-0a1b2c3d4e5f';

test('autocomplete: Indonesia only, Indonesian, Jakarta bias, session token; max 5 suggestions', async () => {
  const g = fakeGoogle({
    suggestions: [
      { placePrediction: { placeId: 'ChIJ_taman_anggrek_1', text: { text: 'Taman Anggrek Residence, Jakarta' }, structuredFormat: { mainText: { text: 'Taman Anggrek Residence' }, secondaryText: { text: 'Jl. Letjen S. Parman, Jakarta Barat' } } } },
      { queryPrediction: { text: { text: 'taman anggrek' } } }, // not a place: skipped
      { placePrediction: { placeId: 'ChIJ_second_place_2', text: { text: 'Mal Taman Anggrek' } } },
    ],
  });
  const out = await autocompletePlaces('KEY', { input: '  taman anggrek ', sessionToken: token }, g.fetchFn);
  assert.deepEqual(out, [
    { placeId: 'ChIJ_taman_anggrek_1', main: 'Taman Anggrek Residence', secondary: 'Jl. Letjen S. Parman, Jakarta Barat' },
    { placeId: 'ChIJ_second_place_2', main: 'Mal Taman Anggrek', secondary: '' },
  ]);
  assert.equal(g.calls.length, 1);
  assert.equal(g.calls[0].url, 'https://places.googleapis.com/v1/places:autocomplete');
  assert.equal((g.calls[0].init.headers as Record<string, string>)['X-Goog-Api-Key'], 'KEY');
  const body = JSON.parse(String(g.calls[0].init.body));
  assert.equal(body.input, 'taman anggrek');
  assert.equal(body.sessionToken, token);
  assert.deepEqual(body.includedRegionCodes, ['id']);
  assert.equal(body.languageCode, 'id');
  assert.ok(body.locationBias.circle.radius <= 50000);
});

test('autocomplete: fewer than 3 characters costs nothing; bad token refused; Google errors surface', async () => {
  const g = fakeGoogle({});
  assert.deepEqual(await autocompletePlaces('KEY', { input: 'ta', sessionToken: token }, g.fetchFn), []);
  assert.equal(g.calls.length, 0);
  await assert.rejects(autocompletePlaces('KEY', { input: 'taman', sessionToken: 'bad token!' }, g.fetchFn), /tidak valid/);
  const failing = fakeGoogle({ error: { message: 'API key not valid' } }, 400);
  await assert.rejects(autocompletePlaces('KEY', { input: 'taman', sessionToken: token }, failing.fetchFn), /Places API 400/);
});

test('details: only location + formattedAddress (Essentials), same session token', async () => {
  const g = fakeGoogle({ location: { latitude: -6.1786, longitude: 106.7915 }, formattedAddress: 'Taman Anggrek Residence, Jakarta Barat' });
  const place = await placeLocation('KEY', { placeId: 'ChIJ_taman_anggrek_1', sessionToken: token }, g.fetchFn);
  assert.deepEqual(place, { latitude: -6.1786, longitude: 106.7915, address: 'Taman Anggrek Residence, Jakarta Barat' });
  assert.equal(g.calls[0].url, `https://places.googleapis.com/v1/places/ChIJ_taman_anggrek_1?sessionToken=${token}&languageCode=id`);
  assert.equal((g.calls[0].init.headers as Record<string, string>)['X-Goog-FieldMask'], 'location,formattedAddress');
  await assert.rejects(placeLocation('KEY', { placeId: '../../x', sessionToken: token }, g.fetchFn), /tidak valid/);
  const noLocation = fakeGoogle({ formattedAddress: 'x' });
  await assert.rejects(placeLocation('KEY', { placeId: 'ChIJ_taman_anggrek_1', sessionToken: token }, noLocation.fetchFn), /tidak ditemukan/);
});
