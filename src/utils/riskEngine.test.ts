import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWindToVectors,
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  exportPoisToCsv,
  formatCoordinates,
  formatTMin,
  generateCalibratedDriftField,
} from './riskEngine';
import { SAUDI_BORDER_RING, SAUDI_INVERTED_MASK_GEOJSON } from '../data/saudiMaskGeoJson';

test('generateCalibratedDriftField covers all 4 Saudi erg zones with valid speeds and azimuths', () => {
  const vectors = generateCalibratedDriftField();
  assert.ok(vectors.length >= 60, `Expected >= 60 vectors, got ${vectors.length}`);

  const zones = new Set(vectors.map((v) => v.erg_zone));
  assert.deepEqual(zones, new Set(["Rub' al Khali", 'Al-Jafurah', 'Ad-Dahna', 'An-Nafud']));

  for (const vec of vectors) {
    assert.ok(vec.speed_m_yr >= 4.0 && vec.speed_m_yr <= 40.0);
    assert.ok(vec.azimuth_deg >= 0 && vec.azimuth_deg < 360);
    assert.ok(vec.lat >= 16.3 && vec.lat <= 32.2);
    assert.ok(vec.lon >= 34.5 && vec.lon <= 55.7);
  }
});

test('evaluatePoiRisks calculates T-min, wind influence, and High/Med/Low tiers accurately', () => {
  const baseVectors = generateCalibratedDriftField();
  const baseline = evaluatePoiRisks(baseVectors, DEFAULT_WIND_FORCING);

  assert.equal(baseline.length, 10);
  const shaybah = baseline.find((p) => p.id === 'poi-shaybah');
  assert.ok(shaybah, 'Shaybah POI should exist');
  assert.equal(shaybah.collision_risk, 'High');
  assert.ok(shaybah.t_min_years > 0 && shaybah.t_min_years < 12);

  // Increasing dominant Shamal wind speed in the same transport direction should increase wind influence
  const stormWind = { speed_kt: 34, azimuth_deg: 165, horizon_years: 10 };
  const stormResults = evaluatePoiRisks(baseVectors, stormWind);
  const haradhBase = baseline.find((p) => p.id === 'poi-haradh')!;
  const haradhStorm = stormResults.find((p) => p.id === 'poi-haradh')!;

  assert.ok(
    haradhStorm.wind_influence > haradhBase.wind_influence,
    `Expected storm wind influence (${haradhStorm.wind_influence}) > baseline (${haradhBase.wind_influence})`
  );
  assert.ok(
    haradhStorm.t_min_years <= haradhBase.t_min_years,
    `Expected storm T-min (${haradhStorm.t_min_years}) <= baseline (${haradhBase.t_min_years})`
  );
});

test('applyWindToVectors preserves vector count and scales velocity under wind forcing', () => {
  const base = generateCalibratedDriftField();
  const boosted = applyWindToVectors(base, { speed_kt: 30, azimuth_deg: 160, horizon_years: 10 });
  assert.equal(boosted.length, base.length);
  const avgBase = base.reduce((acc, v) => acc + v.speed_m_yr, 0) / base.length;
  const avgBoosted = boosted.reduce((acc, v) => acc + v.speed_m_yr, 0) / boosted.length;
  assert.ok(avgBoosted > avgBase);
});

test('GeoJSON mask rings are properly closed with world outer ring and KSA inner hole', () => {
  const coords = SAUDI_INVERTED_MASK_GEOJSON.geometry.coordinates;
  assert.equal(coords.length, 2);
  const outer = coords[0];
  const inner = coords[1];
  assert.deepEqual(outer[0], outer[outer.length - 1]);
  assert.deepEqual(inner[0], inner[inner.length - 1]);
  assert.equal(SAUDI_BORDER_RING.length, inner.length);
});

test('formatters and CSV export produce clean tabular strings', () => {
  assert.equal(formatCoordinates(22.5167, 53.9983), '22.5167° N, 53.9983° E');
  assert.equal(formatTMin(1.5, 18.0), '18.0 mo (1.50 yr)');
  assert.equal(formatTMin(6.4, 76.8), '6.4 yrs (77 mo)');

  const pois = evaluatePoiRisks(generateCalibratedDriftField());
  const csv = exportPoisToCsv(pois);
  const lines = csv.split('\n');
  assert.equal(lines.length, 11);
  assert.ok(lines[0].includes('Estimated T-min (years)'));
});
