import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Columns2 } from 'lucide-react';
import { Marker, Popup, useMap } from 'react-leaflet';
import type { PoiRisk, RiskTier } from '../types/geospatial';
import { formatCoordinates, formatTMin } from '../utils/riskEngine';

interface PoiMarkersLayerProps {
  pois: PoiRisk[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string) => void;
  onComparePoi: (poi: PoiRisk) => void;
}

function getRiskPalette(tier: RiskTier): {
  stroke: string;
  fill: string;
  text: string;
  symbol: string;
} {
  if (tier === 'High') {
    return {
      stroke: '#be123c',
      fill: '#f43f5e',
      text: 'text-rose-400',
      symbol: '◆',
    };
  }
  if (tier === 'Med') {
    return {
      stroke: '#b45309',
      fill: '#f59e0b',
      text: 'text-amber-400',
      symbol: '▲',
    };
  }
  return {
    stroke: '#047857',
    fill: '#10b981',
    text: 'text-emerald-400',
    symbol: '●',
  };
}

function createPoiIcon(tier: RiskTier, isSelected: boolean): L.DivIcon {
  const { fill, stroke } = getRiskPalette(tier);
  const ring = isSelected
    ? `<circle cx="14" cy="14" r="12.5" fill="none" stroke="#22d3ee" stroke-width="2" />`
    : '';

  let shape = `<circle cx="14" cy="14" r="6.5" fill="${fill}" stroke="#090d14" stroke-width="2" />`;
  if (tier === 'High') {
    shape = `<polygon points="14,5.5 22.5,14 14,22.5 5.5,14" fill="${fill}" stroke="#090d14" stroke-width="2" stroke-linejoin="round" />`;
  } else if (tier === 'Med') {
    shape = `<polygon points="14,5.5 22.5,20.5 5.5,20.5" fill="${fill}" stroke="#090d14" stroke-width="2" stroke-linejoin="round" />`;
  }

  const svg = `
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style="display:block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.7));">
      ${ring}
      <circle cx="14" cy="14" r="9.5" fill="${stroke}" fill-opacity="0.22" />
      ${shape}
    </svg>
  `;

  return L.divIcon({
    html: svg,
    className: 'bg-transparent border-0',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

export function PoiMarkersLayer({
  pois,
  selectedPoiId,
  onSelectPoi,
  onComparePoi,
}: PoiMarkersLayerProps) {
  const map = useMap();
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const lastFlownPoiRef = useRef<string | null>(null);
  const poisRef = useRef(pois);
  poisRef.current = pois;

  // Only fly/open popup when selectedPoiId explicitly changes, NEVER when date/wind sliders recalculate pois
  useEffect(() => {
    if (!selectedPoiId) {
      lastFlownPoiRef.current = null;
      return;
    }
    if (lastFlownPoiRef.current === selectedPoiId) {
      return;
    }
    const poi = poisRef.current.find((p) => p.id === selectedPoiId);
    const marker = markerMapRef.current.get(selectedPoiId);
    if (poi && marker) {
      lastFlownPoiRef.current = selectedPoiId;
      map.flyTo([poi.lat, poi.lon], Math.max(map.getZoom(), 7), { duration: 0.45 });
      marker.openPopup();
    }
  }, [selectedPoiId, map]);

  return (
    <>
      {pois.map((poi) => {
        const isSelected = poi.id === selectedPoiId;
        const palette = getRiskPalette(poi.collision_risk);

        return (
          <Marker
            key={poi.id}
            position={[poi.lat, poi.lon]}
            icon={createPoiIcon(poi.collision_risk, isSelected)}
            title={poi.name}
            alt={`${poi.name} (${poi.collision_risk} risk)`}
            ref={(ref) => {
              if (ref) {
                markerMapRef.current.set(poi.id, ref);
              } else {
                markerMapRef.current.delete(poi.id);
              }
            }}
            eventHandlers={{
              click: () => onSelectPoi(poi.id),
            }}
          >
            <Popup className="dunemarch-popup" maxWidth={352}>
              <div className="p-3.5 text-slate-100" data-testid={`poi-popup-${poi.id}`}>
                <div className="pr-5">
                  <div className="text-[11px] font-medium text-slate-400">
                    {poi.category} · {poi.region}
                  </div>
                  <h3 className="mt-0.5 text-sm font-bold leading-snug text-slate-50">
                    {poi.name}
                  </h3>
                </div>

                <div className="mt-1.5 font-mono text-[11px] tabular-nums text-cyan-300">
                  {formatCoordinates(poi.lat, poi.lon)}
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-300 border-t border-slate-800 pt-2">
                  {poi.summary}
                </p>

                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2.5">
                  <div>
                    <dt className="text-[10px] font-medium text-slate-400">Encroachment Risk</dt>
                    <dd className={`mt-0.5 text-xs font-bold tabular-nums ${palette.text}`}>
                      {palette.symbol} {poi.collision_risk} ({poi.collision_probability_pct}%)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium text-slate-400">Breach ETA (T-min)</dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-100">
                      {formatTMin(poi.t_min_years, poi.t_min_months)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium text-slate-400">Wind Influence</dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-100">
                      {poi.wind_influence.toFixed(2)}x
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 border-t border-slate-800 pt-2.5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onComparePoi(poi)}
                    className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                  >
                    <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Before / After SAR</span>
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
