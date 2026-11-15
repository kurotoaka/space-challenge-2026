import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { PoiRisk, RiskTier } from '../types/geospatial';
import { formatCoordinates, formatTMin } from '../utils/riskEngine';

interface RiskMatrixViewProps {
  pois: PoiRisk[];
  onInspectOnMap: (poiId: string) => void;
}

function getRiskTone(tier: RiskTier): string {
  if (tier === 'High') return 'text-rose-700 font-semibold';
  if (tier === 'Med') return 'text-amber-700 font-semibold';
  return 'text-emerald-700 font-semibold';
}

function getRiskSymbol(tier: RiskTier): string {
  if (tier === 'High') return '◆';
  if (tier === 'Med') return '▲';
  return '●';
}

export function RiskMatrixView({ pois, onInspectOnMap }: RiskMatrixViewProps) {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'All' | RiskTier>('All');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pois.filter((p) => {
      if (tierFilter !== 'All' && p.collision_risk !== tierFilter) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [pois, query, tierFilter]);

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Infrastructure Collision Risk Matrix
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Forward-projected NISAR drift vectors interpolated at monitored Saudi Arabian assets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search POIs"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by asset or erg..."
                className="w-56 rounded-md border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filter matrix by risk tier"
              className="flex items-center gap-1 rounded-md bg-slate-200/70 p-1"
            >
              {(['All', 'High', 'Med', 'Low'] as const).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  aria-pressed={tierFilter === tier}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    tierFilter === tier
                      ? 'bg-white text-slate-900 font-semibold border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="px-4 py-3">Point of Interest</th>
                <th className="px-4 py-3">Coordinates</th>
                <th className="px-4 py-3">Collision Risk</th>
                <th className="px-4 py-3 text-right">Probability</th>
                <th className="px-4 py-3 text-right">Estimated T-min</th>
                <th className="px-4 py-3 text-right">Wind Influence</th>
                <th className="px-4 py-3 text-right">Drift Rate</th>
                <th className="px-4 py-3 text-right">Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No monitored points of interest match your filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((poi) => (
                  <tr key={poi.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 max-w-xs">
                      <div className="font-semibold text-slate-900">{poi.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {poi.category} · {poi.region}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatCoordinates(poi.lat, poi.lon)}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap ${getRiskTone(poi.collision_risk)}`}>
                      {getRiskSymbol(poi.collision_risk)} {poi.collision_risk}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {poi.collision_probability_pct.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                      {formatTMin(poi.t_min_years, poi.t_min_months)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {poi.wind_influence.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {poi.effective_drift_m_yr.toFixed(1)} m/yr
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onInspectOnMap(poi.id)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Locate
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
