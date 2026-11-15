export type RiskTier = 'High' | 'Med' | 'Low';

export type VisualizationMode = 'vectors' | 'heatmap' | 'combined';

export type AppView = 'map' | 'matrix' | 'backend';

export type DataSourceMode = 'fastapi' | 'local_model';

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
