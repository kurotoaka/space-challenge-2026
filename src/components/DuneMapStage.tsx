import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Compass, RotateCcw, SlidersHorizontal, Wind } from 'lucide-react';
import { ERG_REGIONS, ERG_REGIONS_GEOJSON } from '../data/ergRegions';
import {
  SAUDI_BORDER_GEOJSON,
  SAUDI_INVERTED_MASK_GEOJSON,
} from '../data/saudiMaskGeoJson';
import type {
  BaseMapStyle,
  CustomComparePoint,
  DriftVector,
  ErgZoneName,
  LayerToggles,
  ObservationEpoch,
  PoiRisk,
  WindForcing,
} from '../types/geospatial';
import { interpolateDriftAtPoint } from '../utils/riskEngine';
import { DriftVectorsLayer } from './DriftVectorsLayer';
import { HeatmapLayer } from './HeatmapLayer';
import { NisarSwathLayer } from './NisarSwathLayer';
import { PoiMarkersLayer } from './PoiMarkersLayer';
import { TimeScrubberBar } from './TimeScrubberBar';

const KSA_CENTER: [number, number] = [24.2, 45.4];
const KSA_ZOOM = 6;
const KSA_MIN_ZOOM = 5;
const KSA_MAX_ZOOM = 17;
// Bounds centered identically on KSA_CENTER [24.2, 45.4] so zooming out to 500 km (zoom 5) keeps Saudi Arabia framed
const KSA_MAX_BOUNDS: L.LatLngBoundsExpression = [
  [11.0, 27.0],
  [37.4, 63.8],
];

interface DuneMapStageProps {
  vectors: DriftVector[];
  pois: PoiRisk[];
  layers: LayerToggles;
  baseMap: BaseMapStyle;
  selectedErg: 'All' | ErgZoneName;
  onSelectErg: (erg: 'All' | ErgZoneName) => void;
  selectedPoiId: string | null;
  onSelectPoi: (id: string | null) => void;
  onComparePoi: (poi: PoiRisk) => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
  pickedSpots: CustomComparePoint[];
  activeCustomSpot: CustomComparePoint | null;
  onSelectCustomSpot: (pt: CustomComparePoint) => void;
  onPickCustomPoint: (pt: CustomComparePoint) => void;
  epochIndex: number;
  epoch: ObservationEpoch;
  onChangeEpoch: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onOpenComparison: () => void;
  wind: WindForcing;
  onChangeWind: (next: WindForcing) => void;
  onResetWind: () => void;
}

function getCompassCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

function createSpotPinIcon(isActive: boolean): L.DivIcon {
  const color = isActive ? '#fbbf24' : '#22d3ee';
  const fill = isActive ? 'rgba(251,191,36,0.22)' : 'rgba(34,211,238,0.16)';
  return L.divIcon({
    html: `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" style="display:block;"><circle cx="13" cy="13" r="10" fill="${fill}" stroke="${color}" stroke-width="1.8" stroke-dasharray="3 2"/><circle cx="13" cy="13" r="3.5" fill="${color}"/></svg>`,
    className: 'bg-transparent border-0',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function MapExtentController({
  resetNonce,
  selectedErg,
  onClearSelection,
}: {
  resetNonce: number;
  selectedErg: 'All' | ErgZoneName;
  onClearSelection: () => void;
}) {
  const map = useMap();
  const prevErgRef = useRef<'All' | ErgZoneName>(selectedErg);
  const prevResetRef = useRef<number>(resetNonce);
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;

  useEffect(() => {
    if (resetNonce !== prevResetRef.current) {
      prevResetRef.current = resetNonce;
      map.flyTo(KSA_CENTER, KSA_ZOOM, { duration: 0.45 });
      onClearSelectionRef.current();
    }
  }, [resetNonce, map]);

  useEffect(() => {
    if (prevErgRef.current === selectedErg) {
      return;
    }
    prevErgRef.current = selectedErg;
    if (selectedErg === 'All') {
      map.flyTo(KSA_CENTER, KSA_ZOOM, { duration: 0.45 });
    } else {
      const target = ERG_REGIONS.find((e) => e.name === selectedErg);
      if (target) {
        map.flyTo(target.center, target.zoom, { duration: 0.45 });
      }
    }
  }, [selectedErg, map]);

  useEffect(() => {
    const handleZoomEnd = () => {
      if (map.getZoom() <= KSA_MIN_ZOOM) {
        const c = map.getCenter();
        if (Math.abs(c.lat - KSA_CENTER[0]) > 0.25 || Math.abs(c.lng - KSA_CENTER[1]) > 0.25) {
          map.panTo(KSA_CENTER, { animate: true, duration: 0.3 });
        }
      }
    };
    map.on('zoomend', handleZoomEnd);
    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  return null;
}

function ErgBoundariesLayer({
  visible,
  selectedErg,
  compareMode,
  onSelectErg,
}: {
  visible: boolean;
  selectedErg: 'All' | ErgZoneName;
  compareMode: boolean;
  onSelectErg: (erg: 'All' | ErgZoneName) => void;
}) {
  const map = useMap();
  const pendingClickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const cancelPending = () => {
      if (pendingClickTimerRef.current !== null) {
        window.clearTimeout(pendingClickTimerRef.current);
        pendingClickTimerRef.current = null;
      }
    };
    map.on('dblclick zoomstart movestart', cancelPending);
    return () => {
      cancelPending();
      map.off('dblclick zoomstart movestart', cancelPending);
    };
  }, [map]);

  if (!visible) return null;

  return (
    <GeoJSON
      key={`ergs-${selectedErg}-${compareMode ? 'pick' : 'nav'}`}
      data={ERG_REGIONS_GEOJSON}
      style={(feature) => {
        const name = feature?.properties?.name as ErgZoneName | undefined;
        const accent = (feature?.properties?.accentColor as string | undefined) || '#22d3ee';
        const isFocused = selectedErg === 'All' || selectedErg === name;
        return {
          color: accent,
          weight: compareMode || selectedErg === name ? 2.0 : 1.25,
          opacity: isFocused ? 0.85 : 0.25,
          dashArray: selectedErg === name || compareMode ? undefined : '5 4',
          fillColor: accent,
          fillOpacity: selectedErg === name ? 0.08 : 0.02,
        };
      }}
      onEachFeature={(feature, layer) => {
        const name = feature?.properties?.name as ErgZoneName | undefined;
        if (!name) return;
        layer.bindTooltip(name, {
          permanent: selectedErg === 'All' || selectedErg === name,
          direction: 'center',
          className: 'dunemarch-erg-tooltip',
        });
        layer.on('click', () => {
          // Never hijack zoomed-in inspection, double-clicks, or clicks inside the already-active Erg
          if (compareMode || map.getZoom() > 7.5 || selectedErg === name) {
            return;
          }
          if (pendingClickTimerRef.current !== null) {
            window.clearTimeout(pendingClickTimerRef.current);
          }
          pendingClickTimerRef.current = window.setTimeout(() => {
            pendingClickTimerRef.current = null;
            if (map.getZoom() <= 7.5) {
              onSelectErg(name);
            }
          }, 240);
        });
      }}
    />
  );
}

function MapClickPicker({
  compareMode,
  vectors,
  spotCounter,
  onPick,
  onRejectedOutsideErg,
}: {
  compareMode: boolean;
  vectors: DriftVector[];
  spotCounter: number;
  onPick: (pt: CustomComparePoint) => void;
  onRejectedOutsideErg: () => void;
}) {
  useMapEvents({
    click(e) {
      if (!compareMode) return;
      const { lat, lng } = e.latlng;
      const local = interpolateDriftAtPoint(lat, lng, vectors);
      if (!local) {
        onRejectedOutsideErg();
        return;
      }
      onPick({
        id: `spot-${Date.now()}-${Math.round(lat * 100)}`,
        lat: Number(lat.toFixed(4)),
        lon: Number(lng.toFixed(4)),
        label: `Spot #${spotCounter + 1} · ${local.ergZone}`,
        ergId: local.ergId,
        ergZone: local.ergZone,
        speedMYr: local.speedMYr,
        azimuthDeg: local.azimuthDeg,
        snr: local.snr,
      });
    },
  });
  return null;
}

const NICE_SCALE_METERS = [
  50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000,
];

function CoordinateAndScaleTelemetry({ vectors }: { vectors: DriftVector[] }) {
  const map = useMap();
  const [coords, setCoords] = useState<{ lat: number; lon: number }>({
    lat: KSA_CENTER[0],
    lon: KSA_CENTER[1],
  });
  const [nearestVec, setNearestVec] = useState<DriftVector | null>(null);
  const [scaleInfo, setScaleInfo] = useState<{ label: string; widthPx: number; pxPerKm: number }>({
    label: '100 km',
    widthPx: 68,
    pxPerKm: 0.68,
  });

  useEffect(() => {
    const recomputeScale = () => {
      const size = map.getSize();
      const y = Math.floor(size.y * 0.5);
      const x1 = Math.floor(size.x * 0.5);
      const x2 = x1 + 100;
      const p1 = map.containerPointToLatLng([x1, y]);
      const p2 = map.containerPointToLatLng([x2, y]);
      const metersPer100Px = Math.max(1, map.distance(p1, p2));
      const metersPerPx = metersPer100Px / 100;

      // Pick a crisp scale bar between 55px and 115px
      let chosenM = 100000;
      for (const candidate of NICE_SCALE_METERS) {
        const w = candidate / metersPerPx;
        if (w >= 50 && w <= 118) {
          chosenM = candidate;
          break;
        }
      }
      const widthPx = Math.max(44, Math.min(124, Math.round(chosenM / metersPerPx)));
      const label = chosenM >= 1000 ? `${chosenM / 1000} km` : `${chosenM} m`;
      const pxPerKm = Number((1000 / metersPerPx).toFixed(2));
      setScaleInfo({ label, widthPx, pxPerKm });
    };

    const handleMove = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setCoords({ lat, lon: lng });

      let best: DriftVector | null = null;
      let bestDistSq = 0.55 * 0.55;
      for (let i = 0; i < vectors.length; i++) {
        const v = vectors[i];
        const d2 = (v.lat - lat) * (v.lat - lat) + (v.lon - lng) * (v.lon - lng);
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          best = v;
        }
      }
      setNearestVec(best);
    };

    recomputeScale();
    map.on('mousemove', handleMove);
    map.on('zoomend moveend resize', recomputeScale);
    return () => {
      map.off('mousemove', handleMove);
      map.off('zoomend moveend resize', recomputeScale);
    };
  }, [map, vectors]);

  return (
    <div
      aria-label="Cursor telemetry and map scale"
      className="pointer-events-none absolute top-3 left-3 z-[450] flex flex-col gap-1.5 items-start"
    >
      <div className="rounded border border-slate-800 bg-[#090d14]/90 backdrop-blur-sm px-2.5 py-1.5 font-mono text-[11px] tabular-nums text-slate-300">
        <span>
          {coords.lat.toFixed(3)}° N, {coords.lon.toFixed(3)}° E
        </span>
        {nearestVec && (
          <span className="ml-2 border-l border-slate-700 pl-2 text-cyan-300">
            {nearestVec.erg_zone} · {nearestVec.speed_m_yr.toFixed(1)} m/yr @{' '}
            {nearestVec.azimuth_deg.toFixed(0)}°
          </span>
        )}
      </div>

      {/* Live Geographic Map Scale Bar */}
      <div
        data-testid="map-scale-bar"
        className="rounded border border-slate-800 bg-[#090d14]/90 backdrop-blur-sm px-2.5 py-1.5 flex items-center gap-2.5 text-[10px] font-mono tabular-nums text-slate-200"
      >
        <div className="flex flex-col items-start">
          <span className="leading-none text-slate-100 font-semibold mb-1">{scaleInfo.label}</span>
          <div
            className="h-1.5 border-x-2 border-b-2 border-cyan-400"
            style={{ width: `${scaleInfo.widthPx}px` }}
          />
        </div>
        <span className="text-slate-400 border-l border-slate-800 pl-2 hidden sm:inline">
          1 km ≈ {scaleInfo.pxPerKm} px · Dunes shift ~20 m/yr
        </span>
      </div>
    </div>
  );
}

export function DuneMapStage({
  vectors,
  pois,
  layers,
  baseMap,
  selectedErg,
  onSelectErg,
  selectedPoiId,
  onSelectPoi,
  onComparePoi,
  compareMode,
  onToggleCompareMode,
  pickedSpots,
  activeCustomSpot,
  onSelectCustomSpot,
  onPickCustomPoint,
  epochIndex,
  epoch,
  onChangeEpoch,
  isPlaying,
  onTogglePlay,
  onOpenComparison,
  wind,
  onChangeWind,
  onResetWind,
}: DuneMapStageProps) {
  const [resetNonce, setResetNonce] = useState(0);
  const [outsideWarning, setOutsideWarning] = useState(false);

  useEffect(() => {
    if (!outsideWarning) return;
    const t = window.setTimeout(() => setOutsideWarning(false), 3000);
    return () => window.clearTimeout(t);
  }, [outsideWarning]);

  useEffect(() => {
    if (!compareMode) setOutsideWarning(false);
  }, [compareMode]);

  return (
    <div className="relative h-full w-full min-h-[500px] bg-[#07090e]" data-testid="dune-map-stage">
      <MapContainer
        center={KSA_CENTER}
        zoom={KSA_ZOOM}
        minZoom={KSA_MIN_ZOOM}
        maxZoom={KSA_MAX_ZOOM}
        maxBounds={KSA_MAX_BOUNDS}
        maxBoundsViscosity={0.9}
        preferCanvas={true}
        wheelDebounceTime={45}
        wheelPxPerZoomLevel={90}
        className={`h-full w-full ${compareMode ? 'cursor-cell' : 'cursor-crosshair'}`}
        zoomControl={false}
      >
        <TileLayer
          key={baseMap === 'sar' ? 'sar' : 'sat'}
          className={baseMap === 'sar' ? 'dunemarch-sar-tiles' : 'dunemarch-sat-tiles'}
          maxNativeZoom={16}
          maxZoom={KSA_MAX_ZOOM}
          updateWhenZooming={false}
          keepBuffer={3}
          attribution="&copy; Esri, Maxar, Earthstar Geographics"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />

        {/* Dark inverted mask dimming surrounding countries outside Saudi Arabia */}
        <GeoJSON
          data={SAUDI_INVERTED_MASK_GEOJSON}
          interactive={false}
          style={{
            fillColor: '#05070c',
            fillOpacity: 0.78,
            stroke: false,
          }}
        />

        {/* Crisp luminous KSA national outline */}
        <GeoJSON
          data={SAUDI_BORDER_GEOJSON}
          interactive={false}
          style={{
            fill: false,
            color: '#38bdf8',
            weight: 1.25,
            opacity: 0.45,
          }}
        />

        {/* Separate Moving Sand Sea Boundaries (4 Ergs) */}
        <ErgBoundariesLayer
          visible={layers.ergBounds}
          selectedErg={selectedErg}
          compareMode={compareMode}
          onSelectErg={onSelectErg}
        />

        <NisarSwathLayer
          visible={layers.sarSwath}
          baseMap={baseMap}
          epoch={epoch}
          selectedErg={selectedErg}
        />
        <HeatmapLayer vectors={vectors} visible={layers.heatmap} selectedErg={selectedErg} />
        <DriftVectorsLayer vectors={vectors} visible={layers.vectors} selectedErg={selectedErg} />

        {/* Persisted custom spot pins clicked inside sand seas */}
        {pickedSpots.map((spot) => (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lon]}
            icon={createSpotPinIcon(activeCustomSpot?.id === spot.id)}
            title={spot.label}
            eventHandlers={{
              click: () => onSelectCustomSpot(spot),
            }}
          />
        ))}

        <PoiMarkersLayer
          pois={pois}
          selectedPoiId={selectedPoiId}
          onSelectPoi={(id) => onSelectPoi(id)}
          onComparePoi={onComparePoi}
        />

        <MapExtentController
          resetNonce={resetNonce}
          selectedErg={selectedErg}
          onClearSelection={() => onSelectPoi(null)}
        />
        <MapClickPicker
          compareMode={compareMode}
          vectors={vectors}
          spotCounter={pickedSpots.length}
          onPick={(pt) => {
            setOutsideWarning(false);
            onPickCustomPoint(pt);
          }}
          onRejectedOutsideErg={() => setOutsideWarning(true)}
        />
        <CoordinateAndScaleTelemetry vectors={vectors} />
      </MapContainer>

      {/* Compare mode / Erg-only enforcement banner (docked above TimeScrubberBar with zero top-HUD overlap) */}
      {compareMode && (
        <div
          role="status"
          className={`pointer-events-none absolute bottom-[122px] left-1/2 -translate-x-1/2 z-[450] rounded border px-3 py-1.5 text-xs font-medium shadow-lg whitespace-nowrap max-w-[calc(100%-2rem)] truncate transition-colors ${
            outsideWarning
              ? 'border-rose-400/70 bg-[#1a0b12]/95 text-rose-200'
              : 'border-amber-400/50 bg-[#090d14]/95 text-amber-300'
          }`}
        >
          {outsideWarning
            ? 'Blocked: outside sand seas — click inside an outlined Erg boundary'
            : 'Spot Compare active — click any coordinate inside an outlined Erg boundary'}
        </div>
      )}

      {/* Top-right compact Reset Extent action */}
      <div className="absolute top-3 right-3 z-[450] flex items-center gap-2">
        {selectedErg !== 'All' && (
          <button
            type="button"
            onClick={() => onSelectErg('All')}
            className="rounded border border-cyan-500/40 bg-[#090d14]/90 px-2.5 py-1.5 text-[11px] font-medium text-cyan-300 hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Show All Ergs
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            onSelectErg('All');
            setResetNonce((n) => n + 1);
          }}
          aria-label="Reset map extent to Saudi Arabia"
          className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-[#090d14]/90 backdrop-blur-sm px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-900 hover:border-slate-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
          <span className="whitespace-nowrap">Reset</span>
        </button>
      </div>

      {/* Right-Hand Telemetry Stack: Drift Speeds + Wind Forcing Controls */}
      <div
        data-testid="right-telemetry-dock"
        className="pointer-events-auto absolute top-14 right-3 z-[450] w-56 max-h-[calc(100%-10.5rem)] overflow-y-auto rounded border border-slate-800 bg-[#090d14]/92 backdrop-blur-sm text-slate-200 shadow-2xl"
      >
        {/* FFT Drift Speed Legend */}
        <div className="p-2.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-300">
            <span>FFT Drift Speed (m/yr)</span>
            <Compass className="h-3 w-3 text-cyan-400" aria-hidden="true" />
          </div>
          <div
            className="mt-1.5 h-1.5 w-full rounded-sm"
            style={{
              background:
                'linear-gradient(90deg, #0891b2 0%, #06b6d4 28%, #f59e0b 62%, #e11d48 100%)',
            }}
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
            <span>4</span>
            <span>15</span>
            <span>27+</span>
          </div>

          <div className="mt-2 border-t border-slate-800 pt-1.5 flex items-center justify-between text-[10px]">
            <span className="font-medium text-rose-400">◆ High</span>
            <span className="font-medium text-amber-400">▲ Med</span>
            <span className="font-medium text-emerald-400">● Low</span>
          </div>
        </div>

        {/* Always-Visible Wind Forcing Controls directly underneath Drift Speeds */}
        <div className="border-t border-slate-800 bg-[#070a11]/90 p-2.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
              <Wind className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
              <span>Wind Forcing</span>
            </div>
            <button
              type="button"
              onClick={onResetWind}
              aria-label="Reset wind forcing parameters"
              className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-cyan-300 hover:border-cyan-500/40 hover:text-cyan-200 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="h-2.5 w-2.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>

          {/* Wind Speed */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <label htmlFor="wind-speed-slider" className="text-slate-300 font-medium">
                Wind Speed
              </label>
              <span className="rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-cyan-300">
                {wind.speed_kt} kt
              </span>
            </div>
            <div className="relative h-4 flex items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-300"
                  style={{ width: `${((wind.speed_kt - 5) / 35) * 100}%` }}
                />
              </div>
              <input
                id="wind-speed-slider"
                type="range"
                min={5}
                max={40}
                step={1}
                value={wind.speed_kt}
                onChange={(e) => onChangeWind({ ...wind, speed_kt: Number(e.target.value) })}
                className="dunemarch-range relative z-10 w-full h-4 cursor-pointer"
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-slate-500 tabular-nums leading-none">
              <span>5 kt</span>
              <span>22 kt</span>
              <span>40 kt</span>
            </div>
          </div>

          {/* Transport Bearing */}
          <div className="space-y-1 pt-0.5 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px]">
              <label htmlFor="wind-azimuth-slider" className="text-slate-300 font-medium">
                Transport Bearing
              </label>
              <span className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-amber-300">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className="shrink-0 text-amber-300 transition-transform duration-150"
                  style={{ transform: `rotate(${wind.azimuth_deg}deg)` }}
                >
                  <path d="M6 1L8.8 9.5L6 7.8L3.2 9.5Z" fill="currentColor" />
                </svg>
                {wind.azimuth_deg}° {getCompassCardinal(wind.azimuth_deg)}
              </span>
            </div>
            <div className="relative h-4 flex items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300"
                  style={{ width: `${(wind.azimuth_deg / 355) * 100}%` }}
                />
              </div>
              <input
                id="wind-azimuth-slider"
                type="range"
                min={0}
                max={355}
                step={5}
                value={wind.azimuth_deg}
                onChange={(e) => onChangeWind({ ...wind, azimuth_deg: Number(e.target.value) })}
                className="dunemarch-range relative z-10 w-full h-4 cursor-pointer"
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-slate-500 tabular-nums leading-none">
              <span>0° N</span>
              <span>180° S</span>
              <span>355° N</span>
            </div>
          </div>

          {/* Horizon */}
          <div className="space-y-1 pt-0.5 border-t border-slate-800/60">
            <div className="flex items-center justify-between text-[10px]">
              <label htmlFor="horizon-slider" className="text-slate-300 font-medium">
                Horizon
              </label>
              <span className="rounded border border-slate-800 bg-slate-900/90 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-emerald-300">
                {wind.horizon_years} yrs
              </span>
            </div>
            <div className="relative h-4 flex items-center">
              <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-slate-800/90 border border-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-cyan-300"
                  style={{ width: `${((wind.horizon_years - 2) / 23) * 100}%` }}
                />
              </div>
              <input
                id="horizon-slider"
                type="range"
                min={2}
                max={25}
                step={1}
                value={wind.horizon_years}
                onChange={(e) => onChangeWind({ ...wind, horizon_years: Number(e.target.value) })}
                className="dunemarch-range relative z-10 w-full h-4 cursor-pointer"
              />
            </div>
            <div className="flex justify-between font-mono text-[9px] text-slate-500 tabular-nums leading-none">
              <span>2 yr</span>
              <span>14 yr</span>
              <span>25 yr</span>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Bottom NISAR 12-Day Multi-Date Time Scrubber */}
      <TimeScrubberBar
        epochIndex={epochIndex}
        onChangeEpoch={onChangeEpoch}
        isPlaying={isPlaying}
        onTogglePlay={onTogglePlay}
        compareMode={compareMode}
        onToggleCompareMode={onToggleCompareMode}
        onOpenComparison={onOpenComparison}
      />
    </div>
  );
}
