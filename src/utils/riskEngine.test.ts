import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWindToVectors,
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  exportPoisToCsv,
  findContainingErg,
  formatCoordinates,
  formatTMin,
  generateCalibratedDriftField,
  getEpochAdjustedWind,
  interpolateDriftAtPoint,
  isPointInPolygon,
} from './riskEngine';
import { computeOnTheGoSpotComparison } from './spotCorrelation';
import { ERG_REGIONS, OBSERVATION_EPOCHS } from '../data/ergRegions';
import { SAUDI_BORDER_RING, SAUDI_INVERTED_MASK_GEOJSON } from '../data/saudiMaskGeoJson';

test('generateCalibratedDriftField produces high-res grid across all 4 Saudi erg zones', () => {
  const vectors = generateCalibratedDriftField();
  assert.ok(vectors.length >= 250, `Expected high-res field >= 250 vectors, got ${vectors.length}`);

  const zones = new Set(vectors.map((v) => v.erg_zone));
  assert.deepEqual(zones, new Set(["Rub' al Khali", 'Al-Jafurah', 'Ad-Dahna', 'An-Nafud']));

  for (const vec of vectors) {
    assert.ok(vec.speed_m_yr >= 4.0 && vec.speed_m_yr <= 45.0);
    assert.ok(vec.azimuth_deg >= 0 && vec.azimuth_deg < 360);
    assert.ok(vec.lat >= 16.3 && vec.lat <= 32.2);
    assert.ok(vec.lon >= 34.5 && vec.lon <= 55.7);
  }
});

test('all 4 Erg region polygons are closed, inside KSA border, and contain their regional centers', () => {
  assert.equal(ERG_REGIONS.length, 4);
  for (const erg of ERG_REGIONS) {
    assert.deepEqual(erg.polygon[0], erg.polygon[erg.polygon.length - 1]);
    assert.ok(erg.polygon.length >= 25, `Expected detailed polygon for ${erg.name}`);
    assert.ok(
      isPointInPolygon(erg.center[0], erg.center[1], erg.polygon),
      `Center for ${erg.name} should lie inside its polygon`
    );
    for (const [lon, lat] of erg.polygon) {
      assert.ok(
        isPointInPolygon(lat, lon, SAUDI_BORDER_RING),
        `Vertex [${lon}, ${lat}] of ${erg.name} must stay inside Saudi Arabia border`
      );
    }
  }
});

test('findContainingErg and interpolateDriftAtPoint block picks outside Saudi ergs', () => {
  const base = generateCalibratedDriftField();
  // Riyadh city center lies outside all 4 sand seas
  assert.equal(findContainingErg(24.7136, 46.6753), null);
  assert.equal(interpolateDriftAtPoint(24.7136, 46.6753, base), null);
  // Outside Saudi border entirely
  assert.equal(interpolateDriftAtPoint(25.2, 55.3, base), null);

  // Two distinct points inside Al-Jafurah yield distinct local measurements
  const p1 = interpolateDriftAtPoint(25.4, 49.45, base);
  const p2 = interpolateDriftAtPoint(25.65, 49.32, base);
  assert.ok(p1 && p1.ergZone === 'Al-Jafurah');
  assert.ok(p2 && p2.ergZone === 'Al-Jafurah');
  assert.notEqual(p1.speedMYr, p2.speedMYr);
});

test('computeOnTheGoSpotComparison runs 2D FFT cross-correlation and recovers shifted displacement', () => {
  const jafurah = ERG_REGIONS.find((e) => e.id === 'al-jafurah')!;
  const analysis = computeOnTheGoSpotComparison({
    lat: 25.48,
    lon: 49.38,
    speedMYr: 20.0,
    azimuthDeg: 155,
    erg: jafurah,
    elapsedYears: 5.0,
  });

  assert.equal(analysis.size, 128);
  assert.equal(analysis.patchSpanM, 512);
  // True shift is 100 m along 155° (no periodic wavelength backward alias)
  const azDiff = Math.abs(((analysis.measuredAzimuthDeg - 155 + 540) % 360) - 180);
  assert.ok(
    azDiff < 12,
    `Expected measured azimuth near 155° (got ${analysis.measuredAzimuthDeg}°)`
  );
  assert.ok(
    Math.abs(analysis.measuredShiftM - 100) < 12,
    `Expected shift recovery ~100 m (got ${analysis.measuredShiftM} m)`
  );
  assert.ok(analysis.snrDb >= 4.0);
  assert.ok(analysis.wavelengthM > 40 && analysis.wavelengthM < 140);

  const spot2 = computeOnTheGoSpotComparison({
    lat: 25.2199,
    lon: 49.4659,
    speedMYr: 22.0,
    azimuthDeg: 158,
    erg: jafurah,
    elapsedYears: 5.0,
  });
  const az2Diff = Math.abs(((spot2.measuredAzimuthDeg - 158 + 540) % 360) - 180);
  assert.ok(az2Diff < 12, `Expected Spot 2 azimuth near 158° (got ${spot2.measuredAzimuthDeg}°)`);
  assert.ok(Math.abs(spot2.measuredShiftM - 110) < 12, `Expected Spot 2 shift ~110 m (got ${spot2.measuredShiftM} m)`);
});

test('evaluatePoiRisks calculates T-min, wind influence, and High/Med/Low tiers accurately', () => {
  const baseVectors = generateCalibratedDriftField();
  const baseline = evaluatePoiRisks(baseVectors, DEFAULT_WIND_FORCING);

  assert.equal(baseline.length, 20);
  const shaybah = baseline.find((p) => p.id === 'poi-shaybah');
  assert.ok(shaybah, 'Shaybah POI should exist');
  assert.equal(shaybah.collision_risk, 'High');
  assert.ok(shaybah.t_min_years > 0 && shaybah.t_min_years < 12);

  const stormWind = { speed_kt: 34, azimuth_deg: 165, horizon_years: 10 };
  const stormResults = evaluatePoiRisks(baseVectors, stormWind);
  const haradhBase = baseline.find((p) => p.id === 'poi-haradh')!;
  const haradhStorm = stormResults.find((p) => p.id === 'poi-haradh')!;

  assert.ok(haradhStorm.wind_influence > haradhBase.wind_influence);
  assert.ok(haradhStorm.t_min_years <= haradhBase.t_min_years);
});

test('applyWindToVectors and epoch progression modulate drift velocity and scene metadata', () => {
  const base = generateCalibratedDriftField();
  const earlyEpoch = OBSERVATION_EPOCHS[0];
  const lateEpoch = OBSERVATION_EPOCHS[OBSERVATION_EPOCHS.length - 1];

  const earlyVecs = applyWindToVectors(base, DEFAULT_WIND_FORCING, earlyEpoch);
  const lateVecs = applyWindToVectors(base, DEFAULT_WIND_FORCING, lateEpoch);

  assert.equal(earlyVecs.length, base.length);
  const avgEarly = earlyVecs.reduce((acc, v) => acc + v.speed_m_yr, 0) / earlyVecs.length;
  const avgLate = lateVecs.reduce((acc, v) => acc + v.speed_m_yr, 0) / lateVecs.length;
  assert.ok(avgLate > avgEarly, `Expected late epoch speed (${avgLate}) > early (${avgEarly})`);
  assert.ok(lateVecs[0].scene_pair.includes(lateEpoch.sceneId));

  const adjWind = getEpochAdjustedWind(DEFAULT_WIND_FORCING, lateEpoch);
  assert.ok(adjWind.speed_kt > DEFAULT_WIND_FORCING.speed_kt);

  assert.equal(OBSERVATION_EPOCHS.length, 30);
  assert.equal(earlyEpoch.date, '2025-11-28');
  assert.equal(earlyEpoch.maturity, 'Science Phase');
  assert.equal(lateEpoch.date, '2026-11-14');
  assert.equal(lateEpoch.maturity, 'Validated V1');
  assert.equal(OBSERVATION_EPOCHS[1].daysSinceBaseline - OBSERVATION_EPOCHS[0].daysSinceBaseline, 12);

  // Verify permanent July 27 - August 10, 2026 instrument outage gap
  const inGap = OBSERVATION_EPOCHS.filter((e) => e.date >= '2026-07-27' && e.date <= '2026-08-09');
  assert.equal(inGap.length, 0, 'No acquisitions should exist inside the Jul 27 - Aug 10 outage');

  const aug10Idx = OBSERVATION_EPOCHS.findIndex((e) => e.date === '2026-08-10');
  assert.ok(aug10Idx > 0);
  const jul26 = OBSERVATION_EPOCHS[aug10Idx - 1];
  const aug10 = OBSERVATION_EPOCHS[aug10Idx];
  assert.equal(jul26.date, '2026-07-26');
  assert.equal(aug10.hasGapBefore, true);
  assert.equal(aug10.stepDeltaDays, 15);
  assert.equal(aug10.daysSinceBaseline - jul26.daysSinceBaseline, 15);
});

test('2D FFT spot comparison stays invariant when normalizing across bridged outage gaps', () => {
  const jafurah = ERG_REGIONS.find((e) => e.id === 'al-jafurah')!;

  const postGap15d = computeOnTheGoSpotComparison({
    lat: 25.48,
    lon: 49.38,
    speedMYr: 21.4,
    azimuthDeg: 158,
    erg: jafurah,
    elapsedYears: 15 / 365.25,
  });

  const bridged27d = computeOnTheGoSpotComparison({
    lat: 25.48,
    lon: 49.38,
    speedMYr: 21.4,
    azimuthDeg: 158,
    erg: jafurah,
    elapsedYears: 27 / 365.25,
  });

  const cumul255d = computeOnTheGoSpotComparison({
    lat: 25.48,
    lon: 49.38,
    speedMYr: 21.4,
    azimuthDeg: 158,
    erg: jafurah,
    elapsedYears: 255 / 365.25,
  });

  // Annualized speed must NOT double or spike across the 15d / 27d outage intervals
  assert.ok(
    postGap15d.measuredSpeedMYr > 10 && postGap15d.measuredSpeedMYr < 32,
    `Expected gap-normalized 15d speed near ~21.4 m/yr, got ${postGap15d.measuredSpeedMYr}`
  );
  assert.ok(
    bridged27d.measuredSpeedMYr > 12 && bridged27d.measuredSpeedMYr < 30,
    `Expected gap-normalized 27d speed near ~21.4 m/yr, got ${bridged27d.measuredSpeedMYr}`
  );
  assert.ok(
    Math.abs(cumul255d.measuredSpeedMYr - 21.4) < 5.0,
    `Expected 255d cumulative speed near 21.4 m/yr, got ${cumul255d.measuredSpeedMYr}`
  );

  // Arbitrary mid-mission date pair (e.g., T+120d before -> T+327d after, 207d interval)
  const customPair = computeOnTheGoSpotComparison({
    lat: 25.48,
    lon: 49.38,
    speedMYr: 21.4,
    azimuthDeg: 158,
    erg: jafurah,
    beforeOffsetYears: 120 / 365.25,
    elapsedYears: 207 / 365.25,
    temporalSeeds: [3.2, 11.7],
  });
  const expectedShift207d = (21.4 * 207) / 365.25;
  assert.ok(
    Math.abs(customPair.measuredShiftM - expectedShift207d) < 3.5,
    `Expected ~${expectedShift207d.toFixed(1)}m shift for 207d date pair, got ${customPair.measuredShiftM}m`
  );
  assert.ok(
    Math.abs(customPair.measuredSpeedMYr - 21.4) < 4.5,
    `Expected ~21.4 m/yr for 207d date pair, got ${customPair.measuredSpeedMYr}`
  );
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
  assert.equal(lines.length, 21);
  assert.ok(lines[0].includes('Encroachment Risk'));
  assert.ok(lines[0].includes('Perimeter Breach ETA'));
});
