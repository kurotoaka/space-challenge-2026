export type RiskTier = 'High' | 'Med' | 'Low';

export type VisualizationMode = 'vectors' | 'heatmap' | 'combined';

export type AppView = 'map' | 'matrix' | 'backend' | 'deck';

export type DataSourceMode = 'fastapi' | 'local_model';

export type ErgZoneName = "Rub' al Khali" | 'Al-Jafurah' | 'Ad-Dahna' | 'An-Nafud';

export type BaseMapStyle = 'satellite' | 'sar' | 'dark';

export interface LayerToggles {
  heatmap: boolean;
  vectors: boolean;
  sarSwath: boolean;
  ergBounds: boolean;
}

export type NisarMaturityTier = 'Science Phase' | 'Provisional' | 'Validated V1';

export interface ObservationEpoch {
  id: string;
  date: string;
  label: string;
  daysSinceBaseline: number;
  stepDeltaDays: number;
  hasGapBefore?: boolean;
  gapNote?: string;
  maturity: NisarMaturityTier;
  sceneId: string;
  orbitTrack: string;
  trackIndex: number;
  polarization: string;
  shamalFactor: number;
  shamalAzimuthShiftDeg: number;
  cloudFreeNote: string;
}

export interface ErgRegion {
  id: string;
  name: ErgZoneName;
  duneType: string;
  center: [number, number];
  zoom: number;
  dominantAzimuthDeg: number;
  meanSpeedMYr: number;
  accentColor: string;
  summary: string;
  polygon: [number, number][]; // [lon, lat] closed ring
}

export interface CustomComparePoint {
  id: string;
  lat: number;
  lon: number;
  label: string;
  ergId: string;
  ergZone: ErgZoneName;
  speedMYr: number;
  azimuthDeg: number;
  snr: number;
}

export interface WindForcing {
  speed_kt: number;
  azimuth_deg: number;
  horizon_years: number;
}

export interface DriftVector {
  id: string;
  lat: number;
  lon: number;
  u_m_yr: number;
  v_m_yr: number;
  speed_m_yr: number;
  azimuth_deg: number;
  snr: number;
  erg_zone: string;
  scene_pair: string;
  source: string;
}

export interface PoiRisk {
  id: string;
  name: string;
  category: string;
  region: string;
  lat: number;
  lon: number;
  summary: string;
  collision_risk: RiskTier;
  collision_probability_pct: number;
  t_min_years: number;
  t_min_months: number;
  wind_influence: number;
  effective_drift_m_yr: number;
  effective_azimuth_deg: number;
  closest_approach_m: number;
  buffer_m: number;
}

export interface SimulationResponse {
  vectors: DriftVector[];
  pois: PoiRisk[];
  wind: WindForcing;
  sourceMode: DataSourceMode;
}
