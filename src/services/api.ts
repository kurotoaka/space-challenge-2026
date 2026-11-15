import type { DataSourceMode, DriftVector, SimulationResponse, WindForcing } from '../types/geospatial';
import {
  applyWindToVectors,
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  generateCalibratedDriftField,
} from '../utils/riskEngine';

const STORAGE_KEY = 'dunemarch_fastapi_url';
const ENABLED_KEY = 'dunemarch_fastapi_enabled';

export function isRemoteFastApiEnabled(): boolean {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.trim().length > 0) {
    return true;
  }
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(ENABLED_KEY) === '1';
  }
  return false;
}

export function getStoredApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim().length > 0) {
      return saved.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (envUrl || 'http://localhost:8000').replace(/\/+$/, '');
}

export function setStoredApiBaseUrl(url: string, enableRemote = true): string {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    if (cleaned) {
      window.localStorage.setItem(STORAGE_KEY, cleaned);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.localStorage.setItem(ENABLED_KEY, enableRemote ? '1' : '0');
  }
  return cleaned || 'http://localhost:8000';
}

const BASE_VECTORS: DriftVector[] = generateCalibratedDriftField();

/**
 * Queries the FastAPI backend (`POST /api/simulate`) when configured/enabled;
 * otherwise runs the deterministic local SAR simulation engine cleanly with zero
 * failed network requests in standalone mode.
 */
export async function fetchSimulationData(
  wind: WindForcing = DEFAULT_WIND_FORCING,
  apiBaseUrl: string = getStoredApiBaseUrl()
): Promise<SimulationResponse> {
  if (!isRemoteFastApiEnabled()) {
    return {
      vectors: applyWindToVectors(BASE_VECTORS, wind),
      pois: evaluatePoiRisks(BASE_VECTORS, wind),
      wind,
      sourceMode: 'local_model',
    };
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1400);

  try {
    const response = await fetch(`${apiBaseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wind),
      signal: controller.signal,
    });
    window.clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`FastAPI HTTP ${response.status}`);
    }

    const data = await response.json();
    const vectors: DriftVector[] = Array.isArray(data.vectors)
      ? applyWindToVectors(data.vectors, wind)
      : applyWindToVectors(BASE_VECTORS, wind);
    const pois = Array.isArray(data.pois)
      ? data.pois
      : evaluatePoiRisks(BASE_VECTORS, wind);

    return {
      vectors,
      pois,
      wind,
      sourceMode: 'fastapi',
    };
  } catch {
    window.clearTimeout(timer);
    return {
      vectors: applyWindToVectors(BASE_VECTORS, wind),
      pois: evaluatePoiRisks(BASE_VECTORS, wind),
      wind,
      sourceMode: 'local_model',
    };
  }
}

export async function probeFastApiHealth(apiBaseUrl: string): Promise<{
  reachable: boolean;
  sourceMode: DataSourceMode;
  message: string;
}> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) {
      setStoredApiBaseUrl(apiBaseUrl, false);
      return {
        reachable: false,
        sourceMode: 'local_model',
        message: `Server responded with HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    setStoredApiBaseUrl(apiBaseUrl, true);
    return {
      reachable: true,
      sourceMode: 'fastapi',
      message: `Connected (${json.vector_count ?? 0} vectors · ${json.engine ?? 'fastapi'})`,
    };
  } catch (err) {
    window.clearTimeout(timer);
    setStoredApiBaseUrl(apiBaseUrl, false);
    const detail = err instanceof Error && err.name === 'AbortError' ? 'Connection timed out' : 'Unreachable from browser';
    return {
      reachable: false,
      sourceMode: 'local_model',
      message: `${detail} — using calibrated local SAR model`,
    };
  }
}
