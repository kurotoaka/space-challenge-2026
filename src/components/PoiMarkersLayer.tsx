import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup, useMap } from 'react-leaflet';
import type { PoiRisk, RiskTier } from '../types/geospatial';
import { formatCoordinates, formatTMin } from '../utils/riskEngine';

interface PoiMarkersLayerProps {
  pois: PoiRisk[];
  selectedPoiId: string | null;
  onSelectPoi: (id: string) => void;
}

function getRiskPalette(tier: RiskTier): {
  stroke: string;
  fill: string;
  text: string;
  symbol: string;
} {
  if (tier === 'High') {
    return {
      stroke: '#991b1b',
      fill: '#dc2626',
      text: 'text-rose-700',
      symbol: '◆',
    };
  }
  if (tier === 'Med') {
    return {
      stroke: '#92400e',
      fill: '#d97706',
      text: 'text-amber-700',
      symbol: '▲',
    };
  }
  return {
    stroke: '#065f46',
    fill: '#059669',
    text: 'text-emerald-700',
    symbol: '●',
  };
}

function createPoiIcon(tier: RiskTier, isSelected: boolean): L.DivIcon {
  const { fill, stroke } = getRiskPalette(tier);
  const ring = isSelected ? `<circle cx="14" cy="14" r="12.5" fill="none" stroke="#0f172a" stroke-width="2" />` : '';

  let shape = `<circle cx="14" cy="14" r="7" fill="${fill}" stroke="#ffffff" stroke-width="2" />`;
  if (tier === 'High') {
    shape = `<polygon points="14,5 23,14 14,23 5,14" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" />`;
  } else if (tier === 'Med') {
    shape = `<polygon points="14,5 23,21 5,21" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" />`;
  }

  const svg = `
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" style="display:block; filter: drop-shadow(0 1px 2px rgba(15,23,42,0.35));">
      ${ring}
      <circle cx="14" cy="14" r="9.5" fill="${stroke}" fill-opacity="0.16" />
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
}: PoiMarkersLayerProps) {
  const map = useMap();
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    if (!selectedPoiId) return;
    const poi = pois.find((p) => p.id === selectedPoiId);
    const marker = markerMapRef.current.get(selectedPoiId);
    if (poi && marker) {
      map.flyTo([poi.lat, poi.lon], Math.max(map.getZoom(), 7), { duration: 0.45 });
      marker.openPopup();
    }
  }, [selectedPoiId, pois, map]);

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
            <Popup className="rimal-popup" maxWidth={350}>
              <div className="p-3.5 text-slate-900" data-testid={`poi-popup-${poi.id}`}>
                <div className="pr-5">
                  <div className="text-[11px] font-medium text-slate-500">
                    {poi.category} · {poi.region}
                  </div>
                  <h3 className="mt-0.5 text-sm font-bold leading-snug text-slate-900">
                    {poi.name}
                  </h3>
                </div>

                <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-600">
                  {formatCoordinates(poi.lat, poi.lon)}
                </div>

                <p className="mt-2 text-xs leading-relaxed text-slate-700 border-t border-slate-100 pt-2">
                  {poi.summary}
                </p>

                <dl className="mt-2.5 grid grid-cols-3 gap-2 border-t border-slate-200 pt-2.5">
                  <div>
                    <dt className="text-[10px] font-medium text-slate-500">Collision Risk</dt>
                    <dd className={`mt-0.5 text-xs font-bold tabular-nums ${palette.text}`}>
                      {palette.symbol} {poi.collision_risk} ({poi.collision_probability_pct}%)
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium text-slate-500">Estimated T-min</dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {formatTMin(poi.t_min_years, poi.t_min_months)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-medium text-slate-500">Wind Influence</dt>
                    <dd className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900">
                      {poi.wind_influence.toFixed(2)}x
                    </dd>
                  </div>
                </dl>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
