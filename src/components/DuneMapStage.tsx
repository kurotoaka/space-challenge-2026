import { useEffect, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { Compass, RotateCcw } from 'lucide-react';
import {
  SAUDI_BORDER_GEOJSON,
  SAUDI_INVERTED_MASK_GEOJSON,
} from '../data/saudiMaskGeoJson';
import type { DriftVector, PoiRisk, VisualizationMode } from '../types/geospatial';
import { DriftVectorsLayer } from './DriftVectorsLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { PoiMarkersLayer } from './PoiMarkersLayer';

const KSA_CENTER: [number, number] = [24.1, 45.2];
const KSA_ZOOM = 6;

interface DuneMapStageProps {
  vectors: DriftVector[];
  pois: PoiRisk[];
  vizMode: VisualizationMode;
  selectedPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
}

function MapExtentController({
  resetNonce,
  onClearSelection,
}: {
  resetNonce: number;
  onClearSelection: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (resetNonce > 0) {
      map.flyTo(KSA_CENTER, KSA_ZOOM, { duration: 0.45 });
      onClearSelection();
    }
  }, [resetNonce, map, onClearSelection]);

  return null;
}

function CoordinateReadout() {
  const map = useMap();
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: KSA_CENTER[0],
    lon: KSA_CENTER[1],
  });

  useEffect(() => {
    const handleMove = (e: L.LeafletMouseEvent) => {
      setCoords({ lat: e.latlng.lat, lon: e.latlng.lng });
    };
    map.on('mousemove', handleMove);
    return () => {
      map.off('mousemove', handleMove);
    };
  }, [map]);

  return (
    <div
      aria-label="Cursor coordinates"
      className="pointer-events-none absolute bottom-3 left-3 z-[450] rounded border border-slate-300 bg-white/95 px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-slate-700"
    >
      {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E
    </div>
  );
}

export function DuneMapStage({
  vectors,
  pois,
  vizMode,
  selectedPoiId,
  onSelectPoi,
}: DuneMapStageProps) {
  const [resetNonce, setResetNonce] = useState(0);

  const showVectors = vizMode === 'vectors' || vizMode === 'combined';
  const showHeatmap = vizMode === 'heatmap' || vizMode === 'combined';

  return (
    <div className="relative h-full w-full min-h-[460px] bg-slate-200" data-testid="dune-map-stage">
      <MapContainer
        center={KSA_CENTER}
        zoom={KSA_ZOOM}
        minZoom={4}
        maxZoom={13}
        className="h-full w-full cursor-crosshair"
        zoomControl={true}
      >
        <TileLayer
          attribution="&copy; Esri, USGS, NOAA"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
        />

        {/* Inverted world polygon mask greying out countries outside Saudi Arabia */}
        <GeoJSON
          data={SAUDI_INVERTED_MASK_GEOJSON}
          interactive={false}
          style={{
            fillColor: '#475569',
            fillOpacity: 0.62,
            stroke: false,
          }}
        />

        {/* Crisp border stroke delineating Saudi Arabia */}
        <GeoJSON
          data={SAUDI_BORDER_GEOJSON}
          interactive={false}
          style={{
            fill: false,
            color: '#0f172a',
            weight: 1.6,
            opacity: 0.75,
          }}
        />

        <HeatmapLayer vectors={vectors} visible={showHeatmap} />
        <DriftVectorsLayer vectors={vectors} visible={showVectors} />
        <PoiMarkersLayer
          pois={pois}
          selectedPoiId={selectedPoiId}
          onSelectPoi={(id) => onSelectPoi(id)}
        />

        <MapExtentController
          resetNonce={resetNonce}
          onClearSelection={() => onSelectPoi(null)}
        />
        <CoordinateReadout />
      </MapContainer>

      {/* Top-right map action: Reset KSA Extent */}
      <div className="absolute top-3 right-3 z-[450] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setResetNonce((n) => n + 1)}
          aria-label="Reset map extent to Saudi Arabia"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <RotateCcw className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
          <span className="whitespace-nowrap">Reset Extent</span>
        </button>
      </div>

      {/* Bottom-right calibrated legend */}
      <div className="pointer-events-none absolute bottom-7 right-3 z-[450] w-56 rounded-md border border-slate-300 bg-white/95 p-3 text-slate-900">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
          <span>Dune Drift Speed (m/yr)</span>
          <Compass className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        </div>
        <div
          className="mt-1.5 h-2 w-full rounded-sm"
          style={{
            background:
              'linear-gradient(90deg, #0284c7 0%, #06b6d4 28%, #f59e0b 65%, #dc2626 100%)',
          }}
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-500">
          <span>4 m/yr</span>
          <span>15 m/yr</span>
          <span>28+ m/yr</span>
        </div>

        <div className="mt-2.5 border-t border-slate-200 pt-2 flex items-center justify-between text-[11px] text-slate-700">
          <span className="font-medium text-rose-700">◆ High</span>
          <span className="font-medium text-amber-700">▲ Med</span>
          <span className="font-medium text-emerald-700">● Low</span>
        </div>
      </div>
    </div>
  );
}
