import { SlidersHorizontal } from 'lucide-react';
import type {
  DataSourceMode,
  PoiRisk,
  RiskTier,
  VisualizationMode,
  WindForcing,
} from '../types/geospatial';
import { formatTMin } from '../utils/riskEngine';

interface ControlSidebarProps {
  vizMode: VisualizationMode;
  onChangeVizMode: (mode: VisualizationMode) => void;
  riskFilter: 'All' | RiskTier;
  onChangeRiskFilter: (filter: 'All' | RiskTier) => void;
  wind: WindForcing;
  onChangeWind: (next: WindForcing) => void;
  onResetWind: () => void;
  pois: PoiRisk[];
  totalPois: PoiRisk[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string) => void;
  sourceMode: DataSourceMode;
}

const VIZ_OPTIONS: Array<{ id: VisualizationMode; label: string }> = [
  { id: 'vectors', label: 'Vectors' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'combined', label: 'Combined' },
];

const RISK_OPTIONS: Array<{ id: 'All' | RiskTier; label: string }> = [
  { id: 'All', label: 'All' },
  { id: 'High', label: 'High' },
  { id: 'Med', label: 'Med' },
  { id: 'Low', label: 'Low' },
];

function getCompassCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

function getRiskColorClass(tier: RiskTier): string {
  if (tier === 'High') return 'text-rose-700';
  if (tier === 'Med') return 'text-amber-700';
  return 'text-emerald-700';
}

function getRiskSymbol(tier: RiskTier): string {
  if (tier === 'High') return '◆';
  if (tier === 'Med') return '▲';
  return '●';
}

export function ControlSidebar({
  vizMode,
  onChangeVizMode,
  riskFilter,
  onChangeRiskFilter,
  wind,
  onChangeWind,
  onResetWind,
  pois,
  totalPois,
  selectedPoiId,
  onSelectPoi,
  sourceMode,
}: ControlSidebarProps) {
  const highCount = totalPois.filter((p) => p.collision_risk === 'High').length;
  const medCount = totalPois.filter((p) => p.collision_risk === 'Med').length;
  const lowCount = totalPois.filter((p) => p.collision_risk === 'Low').length;

  return (
    <aside className="w-full lg:w-[356px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Header summary */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-sm font-bold text-slate-900">
            Saudi Erg Drift &amp; Risk Control
          </h1>
          <span className="text-[11px] font-mono text-slate-500">
            {sourceMode === 'fastapi' ? 'FastAPI Live' : 'SAR Model'}
          </span>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100">
          <div>
            <div className="text-[11px] text-slate-500">High Risk</div>
            <div className="font-mono text-lg font-bold tabular-nums text-rose-700">
              {highCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Med Risk</div>
            <div className="font-mono text-lg font-bold tabular-nums text-amber-700">
              {medCount}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Low Risk</div>
            <div className="font-mono text-lg font-bold tabular-nums text-emerald-700">
              {lowCount}
            </div>
          </div>
        </div>
      </div>

      {/* Trajectory Overlay Mode */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-800 mb-1.5">
            Trajectory Overlay
          </div>
          <div
            role="group"
            aria-label="Trajectory visualization mode"
            className="grid grid-cols-3 gap-1 rounded-md bg-slate-100 p-1"
          >
            {VIZ_OPTIONS.map((opt) => {
              const active = vizMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeVizMode(opt.id)}
                  aria-pressed={active}
                  className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 font-semibold border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dominant Wind Forcing Sliders */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              Dominant Wind Forcing
            </span>
            <button
              type="button"
              onClick={onResetWind}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              Reset
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="wind-speed-slider" className="text-slate-600">
                  Wind Speed
                </label>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {wind.speed_kt} kt
                </span>
              </div>
              <input
                id="wind-speed-slider"
                type="range"
                min={5}
                max={40}
                step={1}
                value={wind.speed_kt}
                onChange={(e) =>
                  onChangeWind({ ...wind, speed_kt: Number(e.target.value) })
                }
                className="mt-1 w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="wind-azimuth-slider" className="text-slate-600">
                  Transport Bearing
                </label>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {wind.azimuth_deg}° {getCompassCardinal(wind.azimuth_deg)}
                </span>
              </div>
              <input
                id="wind-azimuth-slider"
                type="range"
                min={0}
                max={355}
                step={5}
                value={wind.azimuth_deg}
                onChange={(e) =>
                  onChangeWind({ ...wind, azimuth_deg: Number(e.target.value) })
                }
                className="mt-1 w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="horizon-slider" className="text-slate-600">
                  Projection Horizon
                </label>
                <span className="font-mono font-semibold tabular-nums text-slate-900">
                  {wind.horizon_years} yrs
                </span>
              </div>
              <input
                id="horizon-slider"
                type="range"
                min={2}
                max={25}
                step={1}
                value={wind.horizon_years}
                onChange={(e) =>
                  onChangeWind({ ...wind, horizon_years: Number(e.target.value) })
                }
                className="mt-1 w-full accent-blue-600 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* POI Risk Watchlist */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 border-b border-slate-100">
          <h2 className="text-xs font-semibold text-slate-800">
            Monitored POIs ({pois.length})
          </h2>
          <div
            role="group"
            aria-label="Filter POIs by risk"
            className="flex items-center gap-1 rounded bg-slate-100 p-0.5"
          >
            {RISK_OPTIONS.map((opt) => {
              const active = riskFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeRiskFilter(opt.id)}
                  aria-pressed={active}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-slate-900 font-semibold border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-slate-100" aria-label="POI risk watchlist">
          {pois.length === 0 ? (
            <li className="p-4 text-xs text-slate-500">
              No points of interest match the selected risk tier.
            </li>
          ) : (
            pois.map((poi) => {
              const selected = poi.id === selectedPoiId;
              return (
                <li key={poi.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPoi(poi.id)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-600 ${
                      selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 leading-snug">
                        {poi.name}
                      </span>
                      <span
                        className={`shrink-0 text-[11px] font-bold tabular-nums ${getRiskColorClass(
                          poi.collision_risk
                        )}`}
                      >
                        {getRiskSymbol(poi.collision_risk)} {poi.collision_risk}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="truncate">{poi.region}</span>
                      <span className="font-mono tabular-nums text-slate-700 shrink-0">
                        T-min {formatTMin(poi.t_min_years, poi.t_min_months)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
