import type { DriftVector, PoiRisk, RiskTier, WindForcing } from '../types/geospatial';
import { SAUDI_BORDER_RING } from '../data/saudiMaskGeoJson';

export interface SeedPoi {
  id: string;
  name: string;
  category: string;
  region: string;
  lat: number;
  lon: number;
  buffer_m: number;
  upwind_dune_dist_m: number;
  upwind_bearing_deg: number;
  summary: string;
}

export const DEFAULT_WIND_FORCING: WindForcing = {
  speed_kt: 18,
  azimuth_deg: 145,
  horizon_years: 10,
};

export const SEED_POIS: SeedPoi[] = [
  {
    id: 'poi-shaybah',
    name: 'Shaybah Central Processing Facility',
    category: 'Energy Infrastructure',
    region: "Rub' al Khali",
    lat: 22.5167,
    lon: 53.9983,
    buffer_m: 650,
    upwind_dune_dist_m: 215,
    upwind_bearing_deg: 28,
    summary:
      'Critical hydrocarbon processing hub encircled by 150m star and barchan dunes migrating southward.',
  },
  {
    id: 'poi-haradh',
    name: 'Haradh Gas Plant & Spur Line',
    category: 'Energy Infrastructure',
    region: 'Al-Jafurah / Ghawar',
    lat: 24.1442,
    lon: 49.0644,
    buffer_m: 550,
    upwind_dune_dist_m: 190,
    upwind_bearing_deg: 338,
    summary:
      'High-throughput gas processing terminal facing rapid southeastward barchan encroachment from Al-Jafurah.',
  },
  {
    id: 'poi-hofuf-rail',
    name: 'Al-Hofuf Freight Rail Corridor Km 148',
    category: 'Transport & Rail',
    region: 'Al-Ahsa / Al-Jafurah',
    lat: 25.3833,
    lon: 49.685,
    buffer_m: 400,
    upwind_dune_dist_m: 165,
    upwind_bearing_deg: 335,
    summary:
      'Primary east-west rail freight artery experiencing active sand-sheet burial along unprotected embankments.',
  },
  {
    id: 'poi-hwy10-empty',
    name: 'Highway 10 — Batha Solar Corridor',
    category: 'Transport & Rail',
    region: "Rub' al Khali",
    lat: 21.842,
    lon: 51.964,
    buffer_m: 450,
    upwind_dune_dist_m: 410,
    upwind_bearing_deg: 35,
    summary:
      'Straight-line desert freight highway intersecting high-mobility transverse dune trains near the UAE border.',
  },
  {
    id: 'poi-riyadh-dammam',
    name: 'Riyadh–Dammam Rail Sector 214',
    category: 'Transport & Rail',
    region: 'Ad-Dahna',
    lat: 25.241,
    lon: 47.628,
    buffer_m: 420,
    upwind_dune_dist_m: 470,
    upwind_bearing_deg: 342,
    summary:
      'Passenger and cargo rail crossing Ad-Dahna reddish linear dune ridges with seasonal Shamal drift surges.',
  },
  {
    id: 'poi-jubail-pipe',
    name: 'Jubail–Riyadh Desalination Corridor',
    category: 'Water & Utilities',
    region: 'Al-Jafurah',
    lat: 25.915,
    lon: 49.182,
    buffer_m: 480,
    upwind_dune_dist_m: 495,
    upwind_bearing_deg: 332,
    summary:
      'Twin potable water transmission mains exposed to mobile coastal-margin barchan horns south of Jubail.',
  },
  {
    id: 'poi-sakaka-solar',
    name: 'Sakaka Utility Solar Array',
    category: 'Renewable Energy',
    region: 'An-Nafud',
    lat: 29.742,
    lon: 40.068,
    buffer_m: 700,
    upwind_dune_dist_m: 760,
    upwind_bearing_deg: 296,
    summary:
      '300 MW photovoltaic plant bordering northern An-Nafud sand sheets requiring regular perimeter trenching.',
  },
  {
    id: 'poi-alula-heritage',
    name: 'Al-Ula Southern Conservation Buffer',
    category: 'Heritage & Urban',
    region: 'Western An-Nafud',
    lat: 26.617,
    lon: 37.923,
    buffer_m: 600,
    upwind_dune_dist_m: 820,
    upwind_bearing_deg: 295,
    summary:
      'Sandstone heritage valley protected by canyon windbreaks with low, localized aeolian sand accumulation.',
  },
  {
    id: 'poi-sulayyil-grid',
    name: 'As-Sulayyil 380kV Substation',
    category: 'Water & Utilities',
    region: "Western Rub' al Khali",
    lat: 20.461,
    lon: 45.574,
    buffer_m: 500,
    upwind_dune_dist_m: 420,
    upwind_bearing_deg: 35,
    summary:
      'High-voltage grid relay station flanking western Empty Quarter sand tongues during winter dust events.',
  },
  {
    id: 'poi-khurais-field',
    name: 'Khurais Injection Manifold East',
    category: 'Energy Infrastructure',
    region: 'Ad-Dahna',
    lat: 25.072,
    lon: 48.041,
    buffer_m: 520,
    upwind_dune_dist_m: 255,
    upwind_bearing_deg: 344,
    summary:
      'Oilfield water-injection corridor situated immediately leeward of active Ad-Dahna longitudinal dunes.',
  },
];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function isInsideSaudiBorder(lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = SAUDI_BORDER_RING.length - 1; i < SAUDI_BORDER_RING.length; j = i++) {
    const [xi, yi] = SAUDI_BORDER_RING[i];
    const [xj, yj] = SAUDI_BORDER_RING[j];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Deterministic calibrated L-band SAR drift vector field across Saudi Arabia's four major ergs.
 * Mirrors `backend/engine.py:generate_calibrated_ksa_drift_field`.
 */
export function generateCalibratedDriftField(): DriftVector[] {
  const ergZones: Array<[string, number, number, number, number, number, number, number]> = [
    ["Rub' al Khali", 18.8, 22.8, 46.8, 54.4, 0.85, 16.5, 208.0],
    ['Al-Jafurah', 24.2, 26.8, 48.8, 50.2, 0.6, 21.4, 158.0],
    ['Ad-Dahna', 23.2, 27.6, 44.6, 48.2, 0.75, 13.8, 162.0],
    ['An-Nafud', 27.6, 29.5, 39.2, 43.2, 0.7, 11.2, 118.0],
  ];

  const vectors: DriftVector[] = [];
  let idx = 0;

  for (const [zoneName, lat0, lat1, lon0, lon1, step, baseSpeed, baseAz] of ergZones) {
    for (let lat = lat0; lat <= lat1 + 1e-6; lat += step) {
      for (let lon = lon0; lon <= lon1 + 1e-6; lon += step) {
        if (!isInsideSaudiBorder(lat, lon)) {
          continue;
        }
        const wave = Math.sin(lat * 1.9 + lon * 1.3);
        const curl = Math.cos(lat * 2.4 - lon * 1.7);
        const speed = Math.max(4.2, baseSpeed + 4.8 * wave + 1.6 * curl);
        const az = (((baseAz + 16.0 * curl + 7.0 * wave) % 360) + 360) % 360;
        const rad = az * DEG_TO_RAD;
        const u = speed * Math.sin(rad);
        const v = speed * Math.cos(rad);
        const snr = Number((11.5 + 6.5 * Math.abs(wave)).toFixed(2));

        vectors.push({
          id: `vec-${String(idx).padStart(3, '0')}`,
          lat: Number(lat.toFixed(4)),
          lon: Number(lon.toFixed(4)),
          u_m_yr: Number(u.toFixed(2)),
          v_m_yr: Number(v.toFixed(2)),
          speed_m_yr: Number(speed.toFixed(2)),
          azimuth_deg: Number(az.toFixed(1)),
          snr,
          erg_zone: zoneName,
          scene_pair: 'NISAR_L2_GSLC_20261015_20261108',
          source: 'calibrated_sar_model',
        });
        idx += 1;
      }
    }
  }

  return vectors;
}

/**
 * Compute local tangent-plane meters between two lat/lon points around 24°N.
 */
function toLocalMeters(latA: number, lonA: number, latB: number, lonB: number): [number, number] {
  const meanLatRad = ((latA + latB) * 0.5) * DEG_TO_RAD;
  const mPerDegLat = 110750.0;
  const mPerDegLon = 111320.0 * Math.cos(meanLatRad);
  return [(lonA - lonB) * mPerDegLon, (latA - latB) * mPerDegLat];
}

/**
 * Adjusts base SAR drift vectors with live wind forcing perturbation for visual map rendering.
 */
export function applyWindToVectors(vectors: DriftVector[], wind: WindForcing): DriftVector[] {
  const windRad = wind.azimuth_deg * DEG_TO_RAD;
  const windDelta = (wind.speed_kt - 15.0) * 0.42;
  const windU = windDelta * Math.sin(windRad);
  const windV = windDelta * Math.cos(windRad);

  return vectors.map((vec) => {
    const uEff = vec.u_m_yr + windU;
    const vEff = vec.v_m_yr + windV;
    const speedEff = Math.hypot(uEff, vEff);
    const azEff = ((Math.atan2(uEff, vEff) * RAD_TO_DEG) % 360 + 360) % 360;
    return {
      ...vec,
      u_m_yr: Number(uEff.toFixed(2)),
      v_m_yr: Number(vEff.toFixed(2)),
      speed_m_yr: Number(speedEff.toFixed(2)),
      azimuth_deg: Number(azEff.toFixed(1)),
    };
  });
}

/**
 * Evaluates POI collision risk, T-min, probability %, and wind influence factor.
 * Mirrors `backend/db_manager.py:evaluate_poi_risks`.
 */
export function evaluatePoiRisks(
  driftVectors: DriftVector[],
  wind: WindForcing = DEFAULT_WIND_FORCING,
  pois: SeedPoi[] = SEED_POIS
): PoiRisk[] {
  const windRad = wind.azimuth_deg * DEG_TO_RAD;
  const windDelta = (wind.speed_kt - 15.0) * 0.42;
  const windU = windDelta * Math.sin(windRad);
  const windV = windDelta * Math.cos(windRad);

  const assessed: PoiRisk[] = pois.map((poi) => {
    let weightsSum = 0;
    let uSar = 0;
    let vSar = 0;
    let snrAcc = 0;

    for (const vec of driftVectors) {
      const [dxM, dyM] = toLocalMeters(poi.lat, poi.lon, vec.lat, vec.lon);
      const distKm = Math.max(Math.hypot(dxM, dyM) / 1000.0, 5.0);
      const w = 1.0 / (distKm * distKm);
      weightsSum += w;
      uSar += w * vec.u_m_yr;
      vSar += w * vec.v_m_yr;
      snrAcc += w * vec.snr;
    }

    let localSnr = 8.0;
    if (weightsSum > 0) {
      uSar /= weightsSum;
      vSar /= weightsSum;
      localSnr = snrAcc / weightsSum;
    } else {
      uSar = 0;
      vSar = -10.0;
    }

    const uEff = uSar + windU;
    const vEff = vSar + windV;
    const effSpeed = Math.hypot(uEff, vEff);
    const effAz = ((Math.atan2(uEff, vEff) * RAD_TO_DEG) % 360 + 360) % 360;

    const upRad = poi.upwind_bearing_deg * DEG_TO_RAD;
    const duneX0 = poi.upwind_dune_dist_m * Math.sin(upRad);
    const duneY0 = poi.upwind_dune_dist_m * Math.cos(upRad);

    const vSq = uEff * uEff + vEff * vEff;
    const tClosestYr = vSq > 1e-6 ? -(duneX0 * uEff + duneY0 * vEff) / vSq : 99.0;

    const tClamped = Math.max(0.0, Math.min(tClosestYr, wind.horizon_years * 3.0));
    const dxMin = duneX0 + uEff * tClamped;
    const dyMin = duneY0 + vEff * tClamped;
    const dMinM = Math.hypot(dxMin, dyMin);

    const approaching = tClosestYr > 0.0 && dMinM <= poi.buffer_m;
    let tMinYears = 45.0;
    if (approaching && effSpeed > 0.2) {
      const distToEdge = Math.max(12.0, poi.upwind_dune_dist_m - poi.buffer_m * 0.35);
      tMinYears = distToEdge / effSpeed;
    } else if (tClosestYr > 0.0 && effSpeed > 0.2) {
      tMinYears = tClosestYr;
    }

    const sarSpeed = Math.max(Math.hypot(uSar, vSar), 0.1);
    const windInfluence = Number((effSpeed / sarSpeed).toFixed(2));

    const clearanceRatio = dMinM / Math.max(poi.buffer_m, 100.0);
    const proximityScore = Math.exp(-0.9 * Math.pow(clearanceRatio, 1.6));
    const timeUrgency = tClosestYr > 0 ? Math.exp(-0.08 * Math.max(0.0, tMinYears - 1.0)) : 0.08;
    const rawProb =
      100.0 * (0.62 * proximityScore + 0.38 * timeUrgency) * Math.min(1.0, 0.75 + localSnr / 40.0);
    const collisionProb = Number(Math.max(4.0, Math.min(97.5, rawProb)).toFixed(1));

    let riskLevel: RiskTier = 'Low';
    if (collisionProb >= 68.0 || (tMinYears <= 8.0 && clearanceRatio < 0.85)) {
      riskLevel = 'High';
    } else if (collisionProb >= 36.0 || tMinYears <= 16.0) {
      riskLevel = 'Med';
    }

    return {
      id: poi.id,
      name: poi.name,
      category: poi.category,
      region: poi.region,
      lat: Number(poi.lat.toFixed(5)),
      lon: Number(poi.lon.toFixed(5)),
      summary: poi.summary,
      collision_risk: riskLevel,
      collision_probability_pct: collisionProb,
      t_min_years: Number(tMinYears.toFixed(2)),
      t_min_months: Number((tMinYears * 12.0).toFixed(1)),
      wind_influence: windInfluence,
      effective_drift_m_yr: Number(effSpeed.toFixed(2)),
      effective_azimuth_deg: Number(effAz.toFixed(1)),
      closest_approach_m: Number(dMinM.toFixed(1)),
      buffer_m: poi.buffer_m,
    };
  });

  return assessed.sort(
    (a, b) => a.t_min_years - b.t_min_years || b.collision_probability_pct - a.collision_probability_pct
  );
}

export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

export function formatTMin(tMinYears: number, tMinMonths: number): string {
  if (tMinYears >= 35) {
    return '> 35 yrs';
  }
  if (tMinYears < 2) {
    return `${tMinMonths.toFixed(1)} mo (${tMinYears.toFixed(2)} yr)`;
  }
  return `${tMinYears.toFixed(1)} yrs (${Math.round(tMinMonths)} mo)`;
}

export function exportPoisToCsv(pois: PoiRisk[]): string {
  const headers = [
    'ID',
    'POI Name',
    'Category',
    'Region',
    'Latitude',
    'Longitude',
    'Collision Risk',
    'Collision Probability (%)',
    'Estimated T-min (years)',
    'Estimated T-min (months)',
    'Wind Influence Factor',
    'Effective Drift (m/yr)',
    'Effective Azimuth (deg)',
    'Summary',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const rows = pois.map((p) =>
    [
      p.id,
      p.name,
      p.category,
      p.region,
      p.lat,
      p.lon,
      p.collision_risk,
      p.collision_probability_pct,
      p.t_min_years,
      p.t_min_months,
      p.wind_influence,
      p.effective_drift_m_yr,
      p.effective_azimuth_deg,
      p.summary,
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
