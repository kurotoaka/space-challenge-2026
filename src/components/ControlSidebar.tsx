import { Columns2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { ERG_REGIONS } from '../data/ergRegions';
import type {
  BaseMapStyle,
  DataSourceMode,
  ErgZoneName,
  LayerToggles,
  PoiRisk,
  RiskTier,
} from '../types/geospatial';
import { formatTMin } from '../utils/riskEngine';

interface ControlSidebarProps {
  selectedErg: 'All' | ErgZoneName;
  onSelectErg: (erg: 'All' | ErgZoneName) => void;
  layers: LayerToggles;
  onChangeLayers: (next: LayerToggles) => void;
  baseMap: BaseMapStyle;
  onChangeBaseMap: (next: BaseMapStyle) => void;
  riskFilter: 'All' | RiskTier;
  onChangeRiskFilter: (filter: 'All' | RiskTier) => void;
  pois: PoiRisk[];
  totalPois: PoiRisk[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string) => void;
  onComparePoi: (poi: PoiRisk) => void;
  sourceMode: DataSourceMode;
}

const RISK_OPTIONS: Array<{ id: 'All' | RiskTier; label: string }> = [
  { id: 'All', label: 'All' },
  { id: 'High', label: 'High' },
  { id: 'Med', label: 'Med' },
  { id: 'Low', label: 'Low' },
];

function getRiskColorClass(tier: RiskTier): string {
  if (tier === 'High') return 'text-rose-400';
  if (tier === 'Med') return 'text-amber-400';
  return 'text-emerald-400';
}

function getRiskSymbol(tier: RiskTier): string {
  if (tier === 'High') return '◆';
  if (tier === 'Med') return '▲';
  return '●';
}

export function ControlSidebar({
  selectedErg,
  onSelectErg,
  layers,
  onChangeLayers,
  baseMap,
  onChangeBaseMap,
  riskFilter,
  onChangeRiskFilter,
  pois,
  totalPois,
  selectedPoiId,
  onSelectPoi,
  onComparePoi,
  sourceMode,
}: ControlSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const highCount = totalPois.filter((p) => p.collision_risk === 'High').length;
  const medCount = totalPois.filter((p) => p.collision_risk === 'Med').length;
  const lowCount = totalPois.filter((p) => p.collision_risk === 'Low').length;

  if (collapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center border-r border-slate-800/90 bg-[#090d14] py-3 px-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand dune control panel"
          className="rounded border border-slate-800 bg-slate-900 p-2 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <aside className="w-full lg:w-[292px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800/90 bg-[#090d14] flex flex-col overflow-hidden">
      {/* Compact Header & Counts */}
      <div className="px-4 py-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xs font-bold tracking-wide text-slate-100 truncate">
              Saudi Erg Telemetry
            </h1>
            <div className="text-[11px] font-mono text-slate-400">
              {sourceMode === 'fastapi' ? 'FastAPI Live' : 'Calibrated SAR Model'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse dune control panel"
            className="hidden lg:inline-flex rounded border border-slate-800 bg-slate-900/80 p-1.5 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
          >
            <PanelLeftClose className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/70 text-[11px]">
          <div>
            <span className="text-slate-400">◆ High</span>
            <div className="font-mono text-sm font-bold tabular-nums text-rose-400">{highCount}</div>
          </div>
          <div>
            <span className="text-slate-400">▲ Med</span>
            <div className="font-mono text-sm font-bold tabular-nums text-amber-400">{medCount}</div>
          </div>
          <div>
            <span className="text-slate-400">● Low</span>
            <div className="font-mono text-sm font-bold tabular-nums text-emerald-400">{lowCount}</div>
          </div>
        </div>
      </div>

      {/* Sand Sea Region Selector (Separate Moving Dune Regions) */}
      <div className="px-4 py-3 border-b border-slate-800/80 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-200">Sand Sea Region</span>
          <span className="font-mono text-slate-400">{selectedErg === 'All' ? '4 Ergs' : selectedErg}</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Select Saudi erg region">
          <button
            type="button"
            onClick={() => onSelectErg('All')}
            aria-pressed={selectedErg === 'All'}
            className={`col-span-2 rounded px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors cursor-pointer flex items-center justify-between ${
              selectedErg === 'All'
                ? 'bg-cyan-400 text-slate-950 font-semibold'
                : 'border border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span>All Saudi Sand Seas</span>
            <span className="font-mono text-[10px] opacity-80">Overview</span>
          </button>

          {ERG_REGIONS.map((erg) => {
            const active = selectedErg === erg.name;
            return (
              <button
                key={erg.id}
                type="button"
                onClick={() => onSelectErg(erg.name)}
                aria-pressed={active}
                className={`rounded px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer border ${
                  active
                    ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200 font-semibold'
                    : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                }`}
              >
                <div className="truncate font-medium">{erg.name}</div>
                <div className="font-mono text-[10px] tabular-nums text-slate-400">
                  {erg.meanSpeedMYr.toFixed(1)} m/yr · {erg.dominantAzimuthDeg}°
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* High-Res Radar & Telemetry Layers */}
      <div className="px-4 py-3 border-b border-slate-800/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-200">Map &amp; SAR Layers</span>
          <div
            role="group"
            aria-label="Basemap imagery style"
            className="inline-flex rounded border border-slate-800 bg-slate-900 p-0.5 text-[10px]"
          >
            <button
              type="button"
              onClick={() => onChangeBaseMap('satellite')}
              aria-pressed={baseMap === 'satellite'}
              className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                baseMap === 'satellite'
                  ? 'bg-slate-700 text-slate-50 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Satellite
            </button>
            <button
              type="button"
              onClick={() => onChangeBaseMap('sar')}
              aria-pressed={baseMap === 'sar'}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                baseMap === 'sar'
                  ? 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SAR Radar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          {(
            [
              ['heatmap', 'FFT Heatmap'],
              ['vectors', 'Direction Field'],
              ['sarSwath', 'NISAR Swaths'],
              ['ergBounds', 'Erg Borders'],
            ] as const
          ).map(([key, label]) => {
            const active = layers[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChangeLayers({ ...layers, [key]: !active })}
                aria-pressed={active}
                className={`rounded border px-2.5 py-1.5 text-left font-medium transition-colors cursor-pointer flex items-center justify-between ${
                  active
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="truncate">{label}</span>
                <span className="font-mono text-[10px]">{active ? 'ON' : 'OFF'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* POI Risk Watchlist */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-4 py-2 flex items-center justify-between gap-2 border-b border-slate-800/80">
          <h2 className="text-[11px] font-semibold text-slate-200">
            Assets ({pois.length})
          </h2>
          <div
            role="group"
            aria-label="Filter POIs by risk"
            className="flex items-center gap-0.5 rounded border border-slate-800 bg-slate-900 p-0.5"
          >
            {RISK_OPTIONS.map((opt) => {
              const active = riskFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeRiskFilter(opt.id)}
                  aria-pressed={active}
                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                    active
                      ? 'bg-cyan-400 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-slate-800/60" aria-label="POI risk watchlist">
          {pois.length === 0 ? (
            <li className="p-4 text-xs text-slate-400">
              No points of interest match the selected filters.
            </li>
          ) : (
            pois.map((poi) => {
              const selected = poi.id === selectedPoiId;
              return (
                <li
                  key={poi.id}
                  className={`transition-colors ${selected ? 'bg-cyan-500/10' : 'hover:bg-slate-900/80'}`}
                >
                  <div className="px-4 py-2.5 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectPoi(poi.id)}
                      className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-400 rounded"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {poi.name}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                        <span className={`font-bold tabular-nums ${getRiskColorClass(poi.collision_risk)}`}>
                          {getRiskSymbol(poi.collision_risk)} {poi.collision_risk}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          T-min {formatTMin(poi.t_min_years, poi.t_min_months)}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onComparePoi(poi)}
                      aria-label={`Before and after comparison for ${poi.name}`}
                      title="Before / After SAR"
                      className="shrink-0 mt-0.5 rounded border border-slate-800 bg-slate-900 p-1.5 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors cursor-pointer"
                    >
                      <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
