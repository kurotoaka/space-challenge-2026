import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileDown,
  MapPin,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  Play,
  Printer,
  RotateCcw,
  Wind,
} from 'lucide-react';
import { ERG_REGIONS, OBSERVATION_EPOCHS } from '../data/ergRegions';
import { SAUDI_BORDER_RING } from '../data/saudiMaskGeoJson';
import type { DriftVector, ErgZoneName, PoiRisk } from '../types/geospatial';
import { downloadPresentationPptx } from '../utils/pptxExport';
import {
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  formatCoordinates,
  formatTMin,
} from '../utils/riskEngine';
import { computeOnTheGoSpotComparison, type SpotSarAnalysis } from '../utils/spotCorrelation';

interface PresentationViewProps {
  pois: PoiRisk[];
  vectors: DriftVector[];
  baseVectors: DriftVector[];
  onOpenLiveMap: () => void;
}

const SLIDE_TITLES = [
  'Live KSA Sand Seas',
  '2D FFT Radar Demo',
  'Wind & T-min Simulator',
  'NISAR Cloud Pipeline',
  'Risk Matrix & API',
];

const DEMO_HOTSPOTS = [
  {
    id: 'al-jafurah-rail',
    label: 'Al-Hofuf Rail Km 148',
    ergName: 'Al-Jafurah' as ErgZoneName,
    lat: 25.3833,
    lon: 49.685,
    speedMYr: 22.8,
    azimuthDeg: 158,
    caption: 'Fast coastal barchan trains crossing Eastern Province freight corridor',
  },
  {
    id: 'shaybah-hub',
    label: 'Shaybah Processing Hub',
    ergName: "Rub' al Khali" as ErgZoneName,
    lat: 22.5167,
    lon: 53.9983,
    speedMYr: 17.9,
    azimuthDeg: 208,
    caption: '150 m star & compound dunes migrating SSW around critical hydrocarbon plant',
  },
  {
    id: 'khurais-manifold',
    label: 'Khurais Manifold East',
    ergName: 'Ad-Dahna' as ErgZoneName,
    lat: 25.072,
    lon: 48.041,
    speedMYr: 14.4,
    azimuthDeg: 162,
    caption: 'Longitudinal red-sand ridges driven toward central injection corridors',
  },
];

function paintDemoPatch(
  canvas: HTMLCanvasElement,
  analysis: SpotSarAnalysis,
  options: { isAfter: boolean; title: string; subtitle: string }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const srcW = analysis.visualW;
  const srcH = analysis.visualH;
  const src = options.isAfter ? analysis.afterVisual : analysis.beforeVisual;

  const img = ctx.createImageData(w, h);
  const px = img.data;

  for (let y = 0; y < h; y++) {
    const sy = (y / Math.max(1, h - 1)) * (srcH - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const fy = sy - y0;

    for (let x = 0; x < w; x++) {
      const sx = (x / Math.max(1, w - 1)) * (srcW - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const fx = sx - x0;

      const v00 = src[y0 * srcW + x0];
      const v10 = src[y0 * srcW + x1];
      const v01 = src[y1 * srcW + x0];
      const v11 = src[y1 * srcW + x1];

      const intensity =
        v00 + (v10 - v00) * fx + (v01 + (v11 - v01) * fx - (v00 + (v10 - v00) * fx)) * fy;

      const idx = (y * w + x) * 4;
      if (options.isAfter) {
        px[idx] = Math.round(12 + intensity * 224);
        px[idx + 1] = Math.round(20 + intensity * 198);
        px[idx + 2] = Math.round(30 + intensity * 165);
      } else {
        px[idx] = Math.round(10 + intensity * 172);
        px[idx + 1] = Math.round(18 + intensity * 200);
        px[idx + 2] = Math.round(30 + intensity * 222);
      }
      px[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const pxPerMeter = w / analysis.patchSpanM;
  const gridStepPx = 100 * pxPerMeter;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1;
  for (let gx = gridStepPx; gx < w; gx += gridStepPx) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = gridStepPx; gy < h; gy += gridStepPx) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  const refX = w * 0.44;
  const refY = h * 0.44;
  const dxPx = analysis.measuredDxM * pxPerMeter;
  const dyPx = -analysis.measuredDyM * pxPerMeter;

  if (options.isAfter) {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.92)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(refX, refY);
    ctx.lineTo(refX + dxPx, refY + dyPx);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(refX + dxPx, refY + dyPx, 4.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(refX, refY, 4.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Scale bar
  const barPx = 100 * pxPerMeter;
  ctx.fillStyle = 'rgba(7, 9, 14, 0.8)';
  ctx.fillRect(10, h - 32, barPx + 12, 22);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(16, h - 18);
  ctx.lineTo(16, h - 14);
  ctx.lineTo(16 + barPx, h - 14);
  ctx.lineTo(16 + barPx, h - 18);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.fillText('100 m', 20, h - 19);

  // Corner pass label
  const boxW = 200;
  const boxX = options.isAfter ? w - boxW - 10 : 10;
  ctx.fillStyle = 'rgba(7, 9, 14, 0.88)';
  ctx.fillRect(boxX, 10, boxW, 38);
  ctx.strokeStyle = options.isAfter ? 'rgba(34, 211, 238, 0.5)' : 'rgba(148, 163, 184, 0.4)';
  ctx.strokeRect(boxX, 10, boxW, 38);
  ctx.fillStyle = options.isAfter ? '#67e8f9' : '#f8fafc';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.fillText(options.title, boxX + 8, 25);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 10px "IBM Plex Mono", monospace';
  ctx.fillText(options.subtitle, boxX + 8, 40);
}

function projectSvgCoord(lon: number, lat: number): [number, number] {
  const minLon = 34.2;
  const maxLon = 56.2;
  const minLat = 16.0;
  const maxLat = 32.5;
  const x = ((lon - minLon) / (maxLon - minLon)) * 420;
  const y = (1 - (lat - minLat) / (maxLat - minLat)) * 320;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

function ringToSvgPoints(ring: [number, number][]): string {
  return ring.map(([lon, lat]) => projectSvgCoord(lon, lat).join(',')).join(' ');
}

function getCompassCardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((deg % 360) / 45) % 8];
}

export function PresentationView({
  pois,
  vectors,
  baseVectors,
  onOpenLiveMap,
}: PresentationViewProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  // Slide 1 interactive hover Erg
  const [focusedErgId, setFocusedErgId] = useState<string>('al-jafurah');

  // Slide 2 live FFT Before/After demo state
  const [spotIdx, setSpotIdx] = useState(0);
  const [fftHorizon, setFftHorizon] = useState<'12d' | '15d_gap' | '3yr'>('3yr');
  const [splitPct, setSplitPct] = useState(50);
  const [draggingSplit, setDraggingSplit] = useState(false);
  const splitStageRef = useRef<HTMLDivElement>(null);
  const demoBeforeCanvasRef = useRef<HTMLCanvasElement>(null);
  const demoAfterCanvasRef = useRef<HTMLCanvasElement>(null);

  // Slide 3 live Shamal Wind & T-min interactive simulator
  const [demoSpeedKt, setDemoSpeedKt] = useState(DEFAULT_WIND_FORCING.speed_kt);
  const [demoBearingDeg, setDemoBearingDeg] = useState(DEFAULT_WIND_FORCING.azimuth_deg);
  const [crestMode, setCrestMode] = useState<'field' | 'single'>('field');

  const stageRef = useRef<HTMLDivElement>(null);
  const totalSlides = SLIDE_TITLES.length;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setSlideIndex((i) => Math.min(totalSlides - 1, i + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setSlideIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalSlides]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (!stageRef.current) return;
    if (!document.fullscreenElement) {
      await stageRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }

  const activeSpot = DEMO_HOTSPOTS[spotIdx] ?? DEMO_HOTSPOTS[0];
  const activeSpotErg = useMemo(
    () => ERG_REGIONS.find((e) => e.name === activeSpot.ergName) ?? ERG_REGIONS[0],
    [activeSpot.ergName]
  );

  const fftElapsedYears =
    fftHorizon === '12d' ? 12 / 365.25 : fftHorizon === '15d_gap' ? 15 / 365.25 : 3.0;

  const fftDemoAnalysis = useMemo(
    () =>
      computeOnTheGoSpotComparison({
        lat: activeSpot.lat,
        lon: activeSpot.lon,
        speedMYr: activeSpot.speedMYr,
        azimuthDeg: activeSpot.azimuthDeg,
        erg: activeSpotErg,
        elapsedYears: fftElapsedYears,
      }),
    [activeSpot, activeSpotErg, fftElapsedYears]
  );

  useEffect(() => {
    if (slideIndex !== 1) return;
    const beforeTitle =
      fftHorizon === '15d_gap'
        ? 'BEFORE · 2026-07-26'
        : fftHorizon === '12d'
          ? 'BEFORE · 2026-11-02'
          : 'BEFORE · 2025-11-28';
    const afterTitle =
      fftHorizon === '15d_gap'
        ? 'AFTER · 2026-08-10 (GAP)'
        : fftHorizon === '12d'
          ? 'AFTER · 2026-11-14 (V1)'
          : 'FORECAST · +3.0 YEARS';
    const afterSub =
      fftHorizon === '15d_gap'
        ? `FFT Δ +${fftDemoAnalysis.measuredShiftM.toFixed(1)}m · 15d bridged`
        : `FFT Δ +${fftDemoAnalysis.measuredShiftM.toFixed(1)}m @ ${fftDemoAnalysis.measuredSpeedMYr.toFixed(1)} m/yr`;

    if (demoBeforeCanvasRef.current) {
      paintDemoPatch(demoBeforeCanvasRef.current, fftDemoAnalysis, {
        isAfter: false,
        title: beforeTitle,
        subtitle: `512m Aperture · λ ${fftDemoAnalysis.wavelengthM}m`,
      });
    }
    if (demoAfterCanvasRef.current) {
      paintDemoPatch(demoAfterCanvasRef.current, fftDemoAnalysis, {
        isAfter: true,
        title: afterTitle,
        subtitle: afterSub,
      });
    }
  }, [slideIndex, fftDemoAnalysis, fftHorizon]);

  const liveSimPois = useMemo(
    () =>
      evaluatePoiRisks(baseVectors, {
        speed_kt: demoSpeedKt,
        azimuth_deg: demoBearingDeg,
        horizon_years: 10,
      }),
    [baseVectors, demoSpeedKt, demoBearingDeg]
  );

  const highPois = pois.filter((p) => p.collision_risk === 'High');
  const medPois = pois.filter((p) => p.collision_risk === 'Med');
  const lowPois = pois.filter((p) => p.collision_risk === 'Low');
  const maxDrift = vectors.reduce((m, v) => Math.max(m, v.speed_m_yr), 0);

  const ksaSvgOutline = useMemo(() => ringToSvgPoints(SAUDI_BORDER_RING), []);
  const ergSvgShapes = useMemo(
    () =>
      ERG_REGIONS.map((erg) => ({
        ...erg,
        points: ringToSvgPoints(erg.polygon),
        centerSvg: projectSvgCoord(erg.center[1], erg.center[0]),
      })),
    []
  );
  const focusedErg = ergSvgShapes.find((e) => e.id === focusedErgId) ?? ergSvgShapes[1];

  function updateSplit(clientX: number) {
    const el = splitStageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    setSplitPct(Math.round(Math.max(6, Math.min(94, pct))));
  }

  return (
    <main
      ref={stageRef}
      className="flex-1 overflow-y-auto bg-[#07090e] p-4 md:p-5 flex flex-col items-center justify-between gap-3"
    >
      {/* Top Toolbar */}
      <div className="no-print w-full max-w-6xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-100">Interactive Live Demo Deck</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-cyan-300">
            0{slideIndex + 1} / 0{totalSlides}
          </span>
          <span aria-hidden="true">·</span>
          <span>{SLIDE_TITLES[slideIndex]}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenLiveMap}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open Live Map</span>
          </button>

          <button
            type="button"
            disabled={exportingPptx}
            onClick={async () => {
              setExportingPptx(true);
              try {
                await downloadPresentationPptx(pois, vectors);
              } finally {
                setExportingPptx(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{exportingPptx ? 'Exporting...' : 'Download .pptx'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-[#0b0f18] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded border border-slate-800 bg-[#0b0f18] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            )}
            <span>{isFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Interactive 16:9 Demo Stage */}
      <section
        aria-label={`Demo Slide ${slideIndex + 1}: ${SLIDE_TITLES[slideIndex]}`}
        className="w-full max-w-6xl flex-1 min-h-[490px] rounded-lg border border-slate-800 bg-[#0b0f18] p-5 md:p-8 flex flex-col justify-between"
      >
        {/* SLIDE 1: LIVE KSA TACTICAL RADAR MAP DEMO */}
        {slideIndex === 0 && (
          <div className="my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-6 space-y-5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                01 · Saudi Arabia L-Band SAR Monitoring
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-50 leading-tight">
                Tracking Moving Deserts Before They Bury Infrastructure
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Streaming NASA NISAR L2 GSLC radar acquisitions over Saudi Arabia&apos;s four
                major sand seas to measure 2D FFT crest migration and forecast Breach ETA.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">Peak Drift</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-cyan-300">
                    {maxDrift.toFixed(1)}
                    <span className="text-[11px] font-normal text-slate-400 ml-1">m/yr</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">Watched POIs</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-slate-100">
                    {pois.length}
                    <span className="text-[11px] font-normal text-slate-400 ml-1">assets</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">High Threat</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-rose-400">
                    {highPois.length}
                    <span className="text-[11px] font-normal text-slate-400 ml-1">sites</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase text-slate-400">NISAR Span</div>
                  <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-emerald-400">
                    {OBSERVATION_EPOCHS.length}
                    <span className="text-[11px] font-normal text-slate-400 ml-1">epochs</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSlideIndex(1)}
                  className="inline-flex items-center gap-1.5 rounded bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Try Live 2D FFT Demo</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenLiveMap}
                  className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/40 transition-colors cursor-pointer"
                >
                  <MapPin className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                  <span>Launch Full Map</span>
                </button>
              </div>
            </div>

            {/* Interactive SVG Tactical Map of Saudi Arabia + 4 Detailed Ergs */}
            <div className="lg:col-span-6 rounded border border-slate-800 bg-[#07090e] p-3">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                <span>GeoBoundaries KSA · Natural Earth 10m Ergs</span>
                <span className="text-cyan-300">Click an Erg to inspect</span>
              </div>
              <svg
                viewBox="0 0 420 320"
                className="w-full h-64 sm:h-72 bg-[#06080d] rounded border border-slate-800/80"
                role="img"
                aria-label="Interactive tactical map of Saudi Arabia border, four sand seas, and monitored infrastructure pins"
              >
                {/* Coordinate grid */}
                {[64, 128, 192, 256].map((y) => (
                  <line key={`hy-${y}`} x1={0} y1={y} x2={420} y2={y} stroke="#131c2e" strokeWidth={0.7} />
                ))}
                {[84, 168, 252, 336].map((x) => (
                  <line key={`vx-${x}`} x1={x} y1={0} x2={x} y2={320} stroke="#131c2e" strokeWidth={0.7} />
                ))}

                {/* Actual Saudi Arabia geoBoundaries Border */}
                <polygon
                  points={ksaSvgOutline}
                  fill="#0d1422"
                  stroke="#38bdf8"
                  strokeOpacity={0.5}
                  strokeWidth={1.3}
                />

                {/* 4 Detailed Sand Sea Polygons */}
                {ergSvgShapes.map((erg) => {
                  const selected = erg.id === focusedErg.id;
                  return (
                    <g
                      key={erg.id}
                      onClick={() => setFocusedErgId(erg.id)}
                      className="cursor-pointer"
                    >
                      <polygon
                        points={erg.points}
                        fill={erg.accentColor}
                        fillOpacity={selected ? 0.34 : 0.14}
                        stroke={erg.accentColor}
                        strokeWidth={selected ? 1.8 : 1.0}
                      />
                      <text
                        x={erg.centerSvg[0]}
                        y={erg.centerSvg[1]}
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="9"
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight={selected ? 700 : 500}
                      >
                        {erg.name}
                      </text>
                    </g>
                  );
                })}

                {/* All 20 Monitored Saudi POIs plotted on real coordinates */}
                {pois.map((poi) => {
                  const [px, py] = projectSvgCoord(poi.lon, poi.lat);
                  const fill =
                    poi.collision_risk === 'High'
                      ? '#fb7185'
                      : poi.collision_risk === 'Med'
                        ? '#fbbf24'
                        : '#34d399';
                  return (
                    <circle
                      key={poi.id}
                      cx={px}
                      cy={py}
                      r={poi.collision_risk === 'High' ? 3.5 : 2.6}
                      fill={fill}
                      stroke="#07090e"
                      strokeWidth={0.8}
                    >
                      <title>{`${poi.name} · ${poi.collision_risk} (${formatTMin(poi.t_min_years, poi.t_min_months)})`}</title>
                    </circle>
                  );
                })}
              </svg>

              {/* Selected Erg Readout Strip */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-[#090d14] px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-100">{focusedErg.name}</span>
                  <span className="mx-1.5 text-slate-600">·</span>
                  <span className="text-slate-400">{focusedErg.duneType}</span>
                </div>
                <div className="font-mono tabular-nums text-cyan-300">
                  {focusedErg.meanSpeedMYr.toFixed(1)} m/yr @ {focusedErg.dominantAzimuthDeg}°
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: EMBEDDED LIVE 2D FFT BEFORE/AFTER RADAR COMPARATOR DEMO */}
        {slideIndex === 1 && (
          <div className="my-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  02 · Live Visual Example · 2D Radix-2 FFT Crest Correlation
                </div>
                <h2 className="mt-0.5 text-xl md:text-2xl font-bold text-slate-50">
                  Interactive Before / After L-Band Radar Wipe ({activeSpot.label})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {DEMO_HOTSPOTS.map((spot, idx) => (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => setSpotIdx(idx)}
                    aria-pressed={idx === spotIdx}
                    className={`rounded border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${
                      idx === spotIdx
                        ? 'border-cyan-400 bg-cyan-400 text-slate-950 font-semibold'
                        : 'border-slate-800 bg-[#07090e] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {spot.label.split(' ')[0]} · {spot.ergName}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Interactive Split-Wipe SAR Stage */}
              <div className="lg:col-span-8 flex flex-col">
                <div
                  ref={splitStageRef}
                  data-testid="demo-fft-comparator"
                  onPointerDown={(e) => {
                    setDraggingSplit(true);
                    e.currentTarget.setPointerCapture(e.pointerId);
                    updateSplit(e.clientX);
                  }}
                  onPointerMove={(e) => {
                    if (draggingSplit) updateSplit(e.clientX);
                  }}
                  onPointerUp={() => setDraggingSplit(false)}
                  onPointerCancel={() => setDraggingSplit(false)}
                  className="relative h-[270px] sm:h-[300px] w-full rounded border border-slate-800 bg-[#06090f] select-none overflow-hidden cursor-ew-resize touch-none"
                >
                  <canvas
                    ref={demoAfterCanvasRef}
                    width={680}
                    height={300}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
                  >
                    <canvas
                      ref={demoBeforeCanvasRef}
                      width={680}
                      height={300}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Drag demo radar wipe slider"
                    aria-valuemin={6}
                    aria-valuemax={94}
                    aria-valuenow={splitPct}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft') setSplitPct((p) => Math.max(6, p - 4));
                      if (e.key === 'ArrowRight') setSplitPct((p) => Math.min(94, p + 4));
                    }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center focus:outline-none"
                    style={{ left: `${splitPct}%` }}
                  >
                    <div className="h-full w-0.5 bg-cyan-400" />
                    <div className="absolute h-8 w-8 rounded-full border-2 border-cyan-300 bg-[#090d14]/95 text-cyan-300 flex items-center justify-center">
                      <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Telemetry Panel for Slide 2 */}
              <div className="lg:col-span-4 rounded border border-slate-800 bg-[#07090e] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-3">
                  <div className="text-[11px] font-mono uppercase text-slate-400">
                    Temporal Pair Selection
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                    {(
                      [
                        ['12d', '12d Repeat'],
                        ['15d_gap', '15d Gap'],
                        ['3yr', '+3 yr Forecast'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFftHorizon(id)}
                        aria-pressed={fftHorizon === id}
                        className={`rounded border py-1.5 font-mono transition-colors cursor-pointer ${
                          fftHorizon === id
                            ? id === '15d_gap'
                              ? 'border-amber-400 bg-amber-400/20 text-amber-200 font-semibold'
                              : 'border-cyan-400 bg-cyan-400/15 text-cyan-200 font-semibold'
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{activeSpot.caption}</p>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
                  <div>
                    <dt className="text-[10px] font-mono uppercase text-slate-400">FFT Velocity</dt>
                    <dd className="font-mono text-lg font-bold tabular-nums text-cyan-300">
                      {fftDemoAnalysis.measuredSpeedMYr.toFixed(1)}
                      <span className="text-[10px] font-normal text-slate-400 ml-1">m/yr</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-mono uppercase text-slate-400">Crest Shift</dt>
                    <dd className="font-mono text-lg font-bold tabular-nums text-slate-100">
                      +{fftDemoAnalysis.measuredShiftM.toFixed(1)}
                      <span className="text-[10px] font-normal text-slate-400 ml-1">m</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-mono uppercase text-slate-400">Azimuth</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {fftDemoAnalysis.measuredAzimuthDeg.toFixed(1)}°
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-mono uppercase text-slate-400">Peak / SNR</dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-emerald-400">
                      r={fftDemoAnalysis.correlationPeak.toFixed(2)} · {fftDemoAnalysis.snrDb.toFixed(0)} dB
                    </dd>
                  </div>
                </dl>

                <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between border-t border-slate-800 pt-2">
                  <span>Guizar-Sicairos Sub-Pixel DFT</span>
                  <span className="text-cyan-300">{fftDemoAnalysis.computeMs} ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 3: INTERACTIVE SHAMAL WIND & PERIMETER BREACH ETA SIMULATOR */}
        {slideIndex === 2 && (
          <div className="my-auto space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  03 · Live Simulation · Shamal Wind Forcing &amp; UTM 38N Breach ETA
                </div>
                <h2 className="mt-0.5 text-xl md:text-2xl font-bold text-slate-50">
                  Drag Wind Controls to Recompute Asset Collision Timelines Live
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDemoSpeedKt(DEFAULT_WIND_FORCING.speed_kt);
                  setDemoBearingDeg(DEFAULT_WIND_FORCING.azimuth_deg);
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#07090e] px-2.5 py-1 text-xs font-mono text-cyan-300 hover:border-cyan-500/40 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>Reset 18 kt</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Left: Live Ray-Intercept Vector Diagram + Pretty Sliders */}
              <div className="lg:col-span-5 rounded border border-slate-800 bg-[#07090e] p-4 flex flex-col justify-between gap-3.5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Wind className="h-3.5 w-3.5" aria-hidden="true" />
                      Interactive Wind Forcing
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-200">
                      {demoSpeedKt} kt · {demoBearingDeg}° {getCompassCardinal(demoBearingDeg)}
                    </span>
                  </div>

                  {/* Shamal Wind Speed */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="demo-wind-speed" className="text-slate-300 font-medium">
                        Shamal Wind Speed
                      </label>
                      <span className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-cyan-300">
                        {demoSpeedKt} kt
                      </span>
                    </div>
                    <div className="relative h-4 flex items-center">
                      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-slate-800 border border-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-300"
                          style={{ width: `${((demoSpeedKt - 5) / 35) * 100}%` }}
                        />
                      </div>
                      <input
                        id="demo-wind-speed"
                        type="range"
                        min={5}
                        max={40}
                        step={1}
                        value={demoSpeedKt}
                        onChange={(e) => setDemoSpeedKt(Number(e.target.value))}
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
                  <div className="space-y-1 pt-1 border-t border-slate-800/70">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="demo-wind-bearing" className="text-slate-300 font-medium">
                        Transport Bearing
                      </label>
                      <span className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-amber-300">
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          aria-hidden="true"
                          className="shrink-0 text-amber-300 transition-transform duration-150"
                          style={{ transform: `rotate(${demoBearingDeg}deg)` }}
                        >
                          <path d="M6 1L8.8 9.5L6 7.8L3.2 9.5Z" fill="currentColor" />
                        </svg>
                        {demoBearingDeg}° {getCompassCardinal(demoBearingDeg)}
                      </span>
                    </div>
                    <div className="relative h-4 flex items-center">
                      <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-slate-800 border border-slate-700/60 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-300"
                          style={{ width: `${(demoBearingDeg / 355) * 100}%` }}
                        />
                      </div>
                      <input
                        id="demo-wind-bearing"
                        type="range"
                        min={0}
                        max={355}
                        step={5}
                        value={demoBearingDeg}
                        onChange={(e) => setDemoBearingDeg(Number(e.target.value))}
                        className="dunemarch-range relative z-10 w-full h-4 cursor-pointer"
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[9px] text-slate-500 tabular-nums leading-none">
                      <span>0° N</span>
                      <span>180° S</span>
                      <span>355° N</span>
                    </div>
                  </div>
                </div>

                {/* Live Rotating Multi-Crest vs Single-Crest Perimeter Buffer Diagram */}
                {(() => {
                  const assetX = 140;
                  const assetY = 82;
                  const bufR = 26;
                  const rad = (demoBearingDeg * Math.PI) / 180;
                  const ux = Math.sin(rad);
                  const uy = -Math.cos(rad);
                  const rayLen = 38 + (demoSpeedKt - 5) * 0.85;

                  const crests =
                    crestMode === 'field'
                      ? [0, 45, 90, 135, 180, 225, 270, 315].map((angDeg, idx) => {
                          const rAng = (angDeg * Math.PI) / 180;
                          const dist = idx % 2 === 0 ? 54 : 60;
                          return {
                            id: `c-${angDeg}`,
                            x: Math.round(assetX + Math.sin(rAng) * dist),
                            y: Math.round(assetY - Math.cos(rAng) * dist),
                            speedScale: idx % 2 === 0 ? 1.0 : 0.92,
                          };
                        })
                      : [{ id: 'NW', x: 96, y: 48, speedScale: 1.0 }];

                  const analyzedCrests = crests.map((c) => {
                    // Vector from crest to asset center
                    const toAssetX = assetX - c.x;
                    const toAssetY = assetY - c.y;
                    // Forward projection along ray (ux, uy)
                    const proj = toAssetX * ux + toAssetY * uy;
                    const perpDist = Math.abs(toAssetX * -uy + toAssetY * ux);
                    const hitsBuffer = proj > 0 && perpDist <= bufR;
                    const nearMiss = proj > 0 && perpDist <= bufR * 1.45;
                    const len = rayLen * c.speedScale;
                    const alignment = proj / Math.max(1, Math.hypot(toAssetX, toAssetY));
                    return {
                      ...c,
                      endX: c.x + ux * len,
                      endY: c.y + uy * len,
                      hitsBuffer,
                      nearMiss,
                      alignment,
                      perpDist,
                    };
                  });

                  const hitCount = analyzedCrests.filter((c) => c.hitsBuffer).length;
                  const singleAlignment = analyzedCrests[0]?.alignment ?? 0;
                  const singleDirectPct =
                    crestMode === 'single'
                      ? singleAlignment <= 0
                        ? 0
                        : Math.round(
                            Math.max(
                              0,
                              Math.min(
                                97,
                                (1 - Math.min(1, analyzedCrests[0].perpDist / (bufR * 1.6))) *
                                  (55 + demoSpeedKt * 1.05)
                              )
                            )
                          )
                      : 0;

                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-mono text-slate-300">
                          {crestMode === 'field'
                            ? `Erg Field: ${hitCount}/8 upwind crests converging`
                            : singleDirectPct > 0
                              ? `Single Crest Hit Risk: ${singleDirectPct}%`
                              : 'Single Crest: 0% (Diverging)'}
                        </span>
                        <div
                          role="group"
                          aria-label="Crest simulation diagram mode"
                          className="inline-flex rounded border border-slate-800 bg-slate-900 p-0.5 font-mono text-[9px]"
                        >
                          <button
                            type="button"
                            onClick={() => setCrestMode('field')}
                            aria-pressed={crestMode === 'field'}
                            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                              crestMode === 'field'
                                ? 'bg-cyan-400 text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            8-Crest Erg
                          </button>
                          <button
                            type="button"
                            onClick={() => setCrestMode('single')}
                            aria-pressed={crestMode === 'single'}
                            className={`px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                              crestMode === 'single'
                                ? 'bg-cyan-400 text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            1 Crest
                          </button>
                        </div>
                      </div>

                      <svg
                        viewBox="0 0 280 156"
                        className="w-full h-40 rounded border border-slate-800/80 bg-[#06080d]"
                        role="img"
                        aria-label="Dynamic multi-crest ray-to-perimeter intercept diagram"
                      >
                        {/* Subtle radial range ring */}
                        <circle
                          cx={assetX}
                          cy={assetY}
                          r={60}
                          fill="none"
                          stroke="rgba(51,65,85,0.35)"
                          strokeDasharray="2 3"
                          strokeWidth={0.8}
                        />
                        {/* Asset 550m Perimeter Buffer */}
                        <circle
                          cx={assetX}
                          cy={assetY}
                          r={bufR}
                          fill={
                            hitCount > 0
                              ? 'rgba(244,63,94,0.12)'
                              : 'rgba(16,185,129,0.08)'
                          }
                          stroke={hitCount > 0 ? '#fb7185' : '#34d399'}
                          strokeDasharray="4 3"
                          strokeWidth={1.3}
                        />
                        <circle
                          cx={assetX}
                          cy={assetY}
                          r={4.5}
                          fill={hitCount > 0 ? '#fb7185' : '#34d399'}
                        />
                        <text
                          x={assetX}
                          y={assetY + 41}
                          textAnchor="middle"
                          fill="#cbd5e1"
                          fontSize="8.5"
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          Asset Buffer (550 m)
                        </text>

                        {/* Dynamic Dune Crests & Wind Trajectory Rays */}
                        {analyzedCrests.map((c) => {
                          const stroke = c.hitsBuffer
                            ? '#fb7185'
                            : c.nearMiss
                              ? '#fbbf24'
                              : '#38bdf8';
                          const opacity = c.hitsBuffer ? 1 : c.nearMiss ? 0.85 : 0.42;
                          return (
                            <g key={c.id} opacity={opacity}>
                              <line
                                x1={c.x}
                                y1={c.y}
                                x2={c.endX}
                                y2={c.endY}
                                stroke={stroke}
                                strokeWidth={c.hitsBuffer ? 2.1 : 1.4}
                                strokeDasharray={c.hitsBuffer ? undefined : '3 2'}
                              />
                              <circle
                                cx={c.x}
                                cy={c.y}
                                r={c.hitsBuffer ? 4.2 : 3.2}
                                fill={c.hitsBuffer ? '#fbbf24' : '#94a3b8'}
                              />
                              <circle cx={c.endX} cy={c.endY} r={2.6} fill={stroke} />
                              {crestMode === 'single' && (
                                <text
                                  x={c.x}
                                  y={c.y - 9}
                                  textAnchor="middle"
                                  fill={c.hitsBuffer ? '#fbbf24' : '#94a3b8'}
                                  fontSize="8.5"
                                  fontFamily="IBM Plex Mono, monospace"
                                >
                                  {c.hitsBuffer ? 'Upwind Crest (Hit)' : 'Crest (Diverging)'}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Live Ranked T-min Watchlist */}
              <div className="lg:col-span-7 rounded border border-slate-800 bg-[#07090e] p-4 flex flex-col gap-3">
                {crestMode === 'single' && (() => {
                  // Exact single NW crest -> asset center
                  const rad = (demoBearingDeg * Math.PI) / 180;
                  const ux = Math.sin(rad);
                  const uy = -Math.cos(rad);
                  const toAssetX = 140 - 96;
                  const toAssetY = 82 - 48;
                  const distPx = Math.hypot(toAssetX, toAssetY);
                  const proj = toAssetX * ux + toAssetY * uy;
                  const perp = Math.abs(toAssetX * -uy + toAssetY * ux);
                  const dotAlign = proj / distPx;
                  const hits = proj > 0 && perp <= 26;
                  const singlePct =
                    dotAlign <= 0
                      ? 0
                      : Math.round(
                          Math.max(
                            0,
                            Math.min(
                              97,
                              (1 - Math.min(1, perp / (26 * 1.75))) * (52 + demoSpeedKt * 1.1)
                            )
                          )
                        );
                  const singleSpeed = 12 + (demoSpeedKt - 5) * 0.45;
                  const singleEtaYrs = hits ? Math.max(0.4, 240 / Math.max(1, singleSpeed * dotAlign)) : null;

                  return (
                    <div className="rounded border border-slate-800 bg-[#0a0f18] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-cyan-400">
                            Isolated NW Crest Ray Check
                          </div>
                          <div className="font-semibold text-slate-100 mt-0.5">
                            {hits
                              ? 'Direct Perimeter Intercept'
                              : singlePct > 0
                                ? 'Oblique Glancing Approach'
                                : 'Diverging Trajectory — Buffer Clear'}
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <div
                            className={`text-sm font-bold ${
                              singlePct >= 65
                                ? 'text-rose-400'
                                : singlePct > 0
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                            }`}
                          >
                            {singlePct}%
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {singleEtaYrs ? `ETA ${singleEtaYrs.toFixed(1)} yrs` : 'No Breach'}
                          </div>
                        </div>
                      </div>
                      <div className="h-2 w-full rounded bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            singlePct >= 65
                              ? 'bg-rose-500'
                              : singlePct > 0
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.max(2, singlePct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-100">
                      {crestMode === 'field'
                        ? 'Top 5 Saudi Assets in Multi-Crest Sand Seas (Live Recomputed)'
                        : 'Regional Erg Assets (Surrounded by Multi-Directional Dunes)'}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {crestMode === 'field'
                        ? 'Each asset sits inside an Erg surrounded by multiple upwind dunes across shifting bearings.'
                        : 'Even when an isolated crest diverges (0%), full KSA sand seas have upwind dunes on all flanks.'}
                    </div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    Sorted by T-min
                  </span>
                </div>

                <ul className="divide-y divide-slate-800/70">
                  {liveSimPois.slice(0, crestMode === 'single' ? 4 : 5).map((poi) => {
                    const barColor =
                      poi.collision_risk === 'High'
                        ? 'bg-rose-500'
                        : poi.collision_risk === 'Med'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400';
                    const textColor =
                      poi.collision_risk === 'High'
                        ? 'text-rose-400'
                        : poi.collision_risk === 'Med'
                          ? 'text-amber-400'
                          : 'text-emerald-400';
                    return (
                      <li key={poi.id} className="py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-100 truncate">{poi.name}</span>
                            <span className="ml-2 font-mono text-[10px] text-slate-400">
                              {poi.region}
                            </span>
                          </div>
                          <div className="shrink-0 font-mono text-[11px] tabular-nums flex items-center gap-2">
                            <span className={`font-bold ${textColor}`}>{poi.collision_probability_pct}%</span>
                            <span className="text-cyan-300 font-semibold">
                              T-min {formatTMin(poi.t_min_years, poi.t_min_months)}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-200 ${barColor}`}
                            style={{ width: `${poi.collision_probability_pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 4: CLOUD SAR PIPELINE & JUL 27-AUG 10 INSTRUMENT GAP ARCHITECTURE */}
        {slideIndex === 3 && (
          <div className="my-auto space-y-5">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                04 · Architecture &amp; Data Continuity
              </div>
              <h2 className="mt-0.5 text-xl md:text-2xl font-bold text-slate-50">
                Zero-Download NISAR Streaming &amp; Gap-Normalized 2D FFT Pipeline
              </h2>
            </div>

            {/* 4-Stage Visual Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  step: '01 · NASA CMR',
                  title: 'Live Granule Discovery',
                  metric: 'V1 · Prov · Beta',
                  detail: 'earthaccess authenticates ASF DAAC and queries KSA bounds (34.5°E–55.7°E).',
                },
                {
                  step: '02 · xarray + h5netcdf',
                  title: 'HTTP Range Subset',
                  metric: '0 GB Saved',
                  detail: 'Pulls UTM xCoordinates/yCoordinates HDF5 chunks directly into memory.',
                },
                {
                  step: '03 · Dask LocalCluster',
                  title: '8-vCPU Parallelism',
                  metric: '8 Workers',
                  detail: 'OMP_NUM_THREADS=1 processes tiled SAR pairs without exhausting 30 GB RAM.',
                },
                {
                  step: '04 · Fourier Shift',
                  title: 'Sub-Pixel FFT + Δt',
                  metric: '±0.125 px',
                  detail: 'Guizar-Sicairos DFT divides exact displacement by exact Δt (12d or 15d).',
                },
              ].map((card) => (
                <div
                  key={card.step}
                  className="rounded border border-slate-800 bg-[#07090e] p-4 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="text-[10px] font-mono text-cyan-400">{card.step}</div>
                    <div className="mt-1 text-sm font-bold text-slate-100">{card.title}</div>
                  </div>
                  <div className="font-mono text-xl font-bold text-slate-50">{card.metric}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{card.detail}</p>
                </div>
              ))}
            </div>

            {/* Visual Mission Timeline Strip Highlighting Jul 27 - Aug 10 Outage Gap */}
            <div className="rounded border border-slate-800 bg-[#07090e] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">
                  NASA NISAR 30-Epoch Mission Continuity Strip (Nov 28, 2025 → Nov 14, 2026)
                </span>
                <span className="font-mono text-amber-300">
                  Jul 27–Aug 10 Outage Normalized via v = Δd / (15d / 365.25)
                </span>
              </div>
              <div className="grid grid-cols-12 gap-1 h-4">
                <div className="col-span-6 rounded-l bg-slate-700/80 flex items-center justify-center font-mono text-[9px] text-slate-200">
                  Science Phase (Nov 28 &apos;25 – Jul 14 &apos;26)
                </div>
                <div className="col-span-2 bg-cyan-500/35 flex items-center justify-center font-mono text-[9px] text-cyan-200">
                  Provisional
                </div>
                <div className="col-span-1 bg-amber-400 flex items-center justify-center font-mono text-[9px] font-bold text-slate-950">
                  15d Gap
                </div>
                <div className="col-span-1 bg-cyan-500/35 flex items-center justify-center font-mono text-[9px] text-cyan-200">
                  Prov
                </div>
                <div className="col-span-2 rounded-r bg-emerald-500/50 flex items-center justify-center font-mono text-[9px] font-semibold text-emerald-100">
                  Validated V1
                </div>
              </div>
              <div className="flex flex-wrap justify-between text-[11px] font-mono text-slate-400">
                <span>T0: 2025-11-28 (0d)</span>
                <span>Gap: Jul 26 → Aug 10 (T+255d, Δt 15d)</span>
                <span>Latest Validated V1: 2026-11-14 (T+351d)</span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 5: OPERATIONAL RISK BREAKDOWN & LIVE API TELEMETRY */}
        {slideIndex === 4 && (
          <div className="my-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 rounded border border-slate-800 bg-[#07090e] p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  05 · National Asset Exposure ({pois.length} Saudi POIs)
                </div>
                <h2 className="mt-1 text-xl font-bold text-slate-50">
                  Operational Risk Breakdown by Sand Sea &amp; Threat Tier
                </h2>
              </div>

              {/* Risk Tier Summary Bars */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded border border-slate-800 bg-[#0b0f18] p-3">
                  <div className="text-xs font-medium text-rose-400">◆ High Risk</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-slate-50">{highPois.length}</div>
                  <div className="text-[10px] font-mono text-slate-400">Immediate mitigation</div>
                </div>
                <div className="rounded border border-slate-800 bg-[#0b0f18] p-3">
                  <div className="text-xs font-medium text-amber-400">▲ Med Risk</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-slate-50">{medPois.length}</div>
                  <div className="text-[10px] font-mono text-slate-400">Scheduled trenching</div>
                </div>
                <div className="rounded border border-slate-800 bg-[#0b0f18] p-3">
                  <div className="text-xs font-medium text-emerald-400">● Low Risk</div>
                  <div className="mt-1 font-mono text-2xl font-bold text-slate-50">{lowPois.length}</div>
                  <div className="text-[10px] font-mono text-slate-400">Nominal watch</div>
                </div>
              </div>

              {/* Per-Erg Average Drift Speed Visualization */}
              <div className="space-y-2.5">
                {ERG_REGIONS.map((erg) => {
                  const pct = Math.min(100, Math.round((erg.meanSpeedMYr / 25) * 100));
                  return (
                    <div key={erg.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-200">{erg.name}</span>
                        <span className="text-cyan-300 tabular-nums">
                          {erg.meanSpeedMYr.toFixed(1)} m/yr · {erg.dominantAzimuthDeg}°
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, backgroundColor: erg.accentColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-5 rounded border border-slate-800 bg-[#07090e] p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  AWS EC2 FastAPI + Spatial DB
                </div>
                <div className="space-y-1.5 font-mono text-xs text-slate-300">
                  <div className="rounded border border-slate-800 bg-[#0b0f18] px-3 py-2 flex justify-between">
                    <span className="text-cyan-300">GET /api/token-status</span>
                    <span className="text-slate-400">CMR V1/Prov</span>
                  </div>
                  <div className="rounded border border-slate-800 bg-[#0b0f18] px-3 py-2 flex justify-between">
                    <span className="text-cyan-300">GET /api/drift-vectors</span>
                    <span className="text-slate-400">{vectors.length} pts</span>
                  </div>
                  <div className="rounded border border-slate-800 bg-[#0b0f18] px-3 py-2 flex justify-between">
                    <span className="text-cyan-300">GET /api/pois</span>
                    <span className="text-slate-400">{pois.length} KSA POIs</span>
                  </div>
                  <div className="rounded border border-slate-800 bg-[#0b0f18] px-3 py-2 flex justify-between">
                    <span className="text-cyan-300">POST /api/simulate</span>
                    <span className="text-slate-400">UTM 38N T-min</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={onOpenLiveMap}
                  className="w-full inline-flex items-center justify-center gap-2 rounded bg-cyan-400 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer"
                >
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                  <span>Explore Interactive Map Stage</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlideIndex(1)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Columns2 className="h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />
                  <span>Replay Live 2D FFT Demo</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>
            DuneMarch · {formatCoordinates(24.2, 45.4)} · UTM 38N (EPSG:32638)
          </span>
          <span className="tabular-nums">
            0{slideIndex + 1} / 0{totalSlides}
          </span>
        </div>
      </section>

      {/* Slide Navigation */}
      <nav
        aria-label="Slide navigation"
        className="no-print w-full max-w-6xl flex flex-wrap items-center justify-between gap-3"
      >
        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
          disabled={slideIndex === 0}
          className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#0b0f18] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Prev</span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Demo slides">
          {SLIDE_TITLES.map((title, idx) => {
            const active = idx === slideIndex;
            return (
              <button
                key={title}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSlideIndex(idx)}
                className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-400 text-slate-950 font-semibold'
                    : 'bg-[#0b0f18] border border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                0{idx + 1}. {title}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.min(totalSlides - 1, i + 1))}
          disabled={slideIndex === totalSlides - 1}
          className="inline-flex items-center gap-1 rounded bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </main>
  );
}
