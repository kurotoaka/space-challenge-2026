import { useEffect, useMemo, useRef, useState } from 'react';
import { MoveHorizontal, X } from 'lucide-react';
import { ERG_REGIONS, OBSERVATION_EPOCHS } from '../data/ergRegions';
import type {
  CustomComparePoint,
  ErgZoneName,
  ObservationEpoch,
  PoiRisk,
} from '../types/geospatial';
import { formatCoordinates, formatTMin } from '../utils/riskEngine';
import { computeOnTheGoSpotComparison, type SpotSarAnalysis } from '../utils/spotCorrelation';

interface BeforeAfterModalProps {
  open: boolean;
  onClose: () => void;
  poi: PoiRisk | null;
  customPoint: CustomComparePoint | null;
  pickedSpots: CustomComparePoint[];
  allPois: PoiRisk[];
  onSwitchPoi: (poi: PoiRisk | null) => void;
  onSwitchCustomSpot: (pt: CustomComparePoint) => void;
  ergName: 'All' | ErgZoneName;
  epoch: ObservationEpoch;
  horizonYears: number;
}

/**
 * Renders an Earth-anchored SAR backscatter patch at crisp HiDPI resolution (`dpr >= 2`)
 * with 100 m UTM reference grid, measured FFT crest vector, and target reticle.
 * Text badges and metric scale labels are rendered as native Retina DOM overlays.
 */
function paintAnalysisPatch(
  canvas: HTMLCanvasElement,
  offscreen: HTMLCanvasElement,
  analysis: SpotSarAnalysis,
  options: {
    cssW: number;
    cssH: number;
    isAfter: boolean;
    hasTargetPin: boolean;
    targetColor: string;
  }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { cssW: w, cssH: h } = options;
  const dpr = Math.max(2, Math.min(window.devicePixelRatio || 2, 3));
  const targetW = Math.round(w * dpr);
  const targetH = Math.round(h * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const srcW = analysis.visualW;
  const srcH = analysis.visualH;
  if (offscreen.width !== srcW || offscreen.height !== srcH) {
    offscreen.width = srcW;
    offscreen.height = srcH;
  }

  const octx = offscreen.getContext('2d');
  if (!octx) return;

  const src = options.isAfter ? analysis.afterVisual : analysis.beforeVisual;
  const img = octx.createImageData(srcW, srcH);
  const px = img.data;

  for (let i = 0; i < srcW * srcH; i++) {
    const intensity = src[i];
    const idx = i * 4;
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
  octx.putImageData(img, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(offscreen, 0, 0, w, h);

  // Subtle 100 m UTM metric reference grid
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

  // Highlight tracked dune crest position + real FFT-recovered shift vector in ground pixels
  const refX = w * 0.44;
  const refY = h * 0.42;
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
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.92)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(refX, refY, 4.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Spot center / asset perimeter reticle
  if (options.hasTargetPin) {
    const pxTarget = w * 0.5;
    const pyTarget = h * 0.52;
    ctx.strokeStyle = options.targetColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pxTarget, pyTarget, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = options.targetColor;
    ctx.beginPath();
    ctx.arc(pxTarget, pyTarget, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function BeforeAfterModal({
  open,
  onClose,
  poi,
  customPoint,
  pickedSpots,
  allPois,
  onSwitchPoi,
  onSwitchCustomSpot,
  ergName,
  epoch,
  horizonYears,
}: BeforeAfterModalProps) {
  // Resolve exact sequential pair (handles T0 baseline and the 15d Jul 27–Aug 10 gap cleanly)
  const currentIdx = Math.max(
    0,
    OBSERVATION_EPOCHS.findIndex((e) => e.id === epoch.id)
  );
  const pairAfterIdx = currentIdx === 0 ? 1 : currentIdx;
  const pairBeforeIdx = Math.max(0, pairAfterIdx - 1);
  const pairBeforeEpoch = OBSERVATION_EPOCHS[pairBeforeIdx];
  const pairAfterEpoch = OBSERVATION_EPOCHS[pairAfterIdx];
  const stepDays = Math.max(12, pairAfterEpoch.stepDeltaDays || 12);
  const cumulDays = Math.max(12, epoch.daysSinceBaseline || 12);

  const [splitPct, setSplitPct] = useState(50);
  const [compareHorizon, setCompareHorizon] = useState<'custom' | 'step' | 'cumulative' | 'forecast'>('custom');
  const [customBeforeIdx, setCustomBeforeIdx] = useState<number>(0);
  const [customAfterIdx, setCustomAfterIdx] = useState<number>(pairAfterIdx);
  const [dragging, setDragging] = useState(false);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 766, h: 340 });

  const stageRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Keep default after-date aligned when scrubber epoch changes and user isn't in a locked custom pair
  useEffect(() => {
    if (compareHorizon !== 'custom') {
      setCustomAfterIdx(pairAfterIdx);
      if (compareHorizon === 'step') {
        setCustomBeforeIdx(pairBeforeIdx);
      } else {
        setCustomBeforeIdx(0);
      }
    }
  }, [pairAfterIdx, pairBeforeIdx, compareHorizon]);

  const activeBeforeIdx =
    compareHorizon === 'step'
      ? pairBeforeIdx
      : compareHorizon === 'custom'
        ? Math.max(0, Math.min(customBeforeIdx, OBSERVATION_EPOCHS.length - 2))
        : 0;

  const activeAfterIdx =
    compareHorizon === 'step'
      ? pairAfterIdx
      : compareHorizon === 'custom'
        ? Math.max(activeBeforeIdx + 1, Math.min(customAfterIdx, OBSERVATION_EPOCHS.length - 1))
        : pairAfterIdx;

  const activeBeforeEpoch = OBSERVATION_EPOCHS[activeBeforeIdx];
  const activeAfterEpoch = OBSERVATION_EPOCHS[activeAfterIdx];
  const pairSpanDays = Math.max(
    12,
    activeAfterEpoch.daysSinceBaseline - activeBeforeEpoch.daysSinceBaseline
  );
  const pairBridgesGap = OBSERVATION_EPOCHS.slice(activeBeforeIdx + 1, activeAfterIdx + 1).some(
    (e) => e.hasGapBefore
  );

  const fallbackErg = ERG_REGIONS.find((e) => e.name === ergName) ?? ERG_REGIONS[0];

  const targetLat = poi ? poi.lat : customPoint ? customPoint.lat : fallbackErg.center[0];
  const targetLon = poi ? poi.lon : customPoint ? customPoint.lon : fallbackErg.center[1];

  const targetErg = useMemo(() => {
    if (customPoint) {
      return ERG_REGIONS.find((e) => e.id === customPoint.ergId) ?? fallbackErg;
    }
    if (poi) {
      return ERG_REGIONS.find((e) => poi.region.includes(e.name)) ?? fallbackErg;
    }
    return fallbackErg;
  }, [poi, customPoint, fallbackErg]);

  const inputSpeed = poi
    ? poi.effective_drift_m_yr
    : customPoint
      ? customPoint.speedMYr
      : fallbackErg.meanSpeedMYr;

  const inputAzimuth = poi
    ? poi.effective_azimuth_deg
    : customPoint
      ? customPoint.azimuthDeg
      : fallbackErg.dominantAzimuthDeg;

  const elapsedYears =
    compareHorizon === 'forecast' ? Math.min(horizonYears, 5) : pairSpanDays / 365.25;

  const beforeOffsetYears =
    compareHorizon === 'forecast' ? 0 : activeBeforeEpoch.daysSinceBaseline / 365.25;

  const temporalSeeds: [number, number] =
    compareHorizon === 'forecast'
      ? [1.0, 2.7]
      : [1.0 + activeBeforeIdx * 0.37, 2.7 + activeAfterIdx * 0.41];

  // Real-time on-the-go local per-spot patch synthesis + 2D Radix-2 FFT peak detection
  const analysis = useMemo(
    () =>
      computeOnTheGoSpotComparison({
        lat: targetLat,
        lon: targetLon,
        speedMYr: inputSpeed,
        azimuthDeg: inputAzimuth,
        erg: targetErg,
        elapsedYears,
        beforeOffsetYears,
        temporalSeeds,
      }),
    [
      targetLat,
      targetLon,
      inputSpeed,
      inputAzimuth,
      targetErg,
      elapsedYears,
      beforeOffsetYears,
      temporalSeeds[0],
      temporalSeeds[1],
    ]
  );

  const isCustom = Boolean(customPoint && !poi);
  const title = poi
    ? poi.name
    : customPoint
      ? customPoint.label
      : `${fallbackErg.name} Reference Core`;

  const subtitle = poi
    ? `${poi.region} · ${formatCoordinates(poi.lat, poi.lon)} · ${analysis.terrainClass}`
    : customPoint
      ? `${customPoint.ergZone} · ${formatCoordinates(customPoint.lat, customPoint.lon)} · ${analysis.terrainClass}`
      : `${fallbackErg.duneType} · ${formatCoordinates(fallbackErg.center[0], fallbackErg.center[1])}`;

  function updateSplitFromClientX(clientX: number) {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100;
    setSplitPct(Math.round(Math.max(4, Math.min(96, pct))));
  }

  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth || 766;
      const h = el.clientHeight || 340;
      setStageSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const beforeDateLabel = activeBeforeEpoch.date;
  const afterDateLabel =
    compareHorizon === 'forecast'
      ? `FORECAST · +${Math.min(horizonYears, 5)} YR`
      : `AFTER · ${activeAfterEpoch.date}`;

  const beforeSubLabel =
    compareHorizon === 'forecast'
      ? `${analysis.patchSpanM}m SAR Patch · λ~${analysis.wavelengthM}m`
      : `T+${activeBeforeEpoch.daysSinceBaseline}d (${activeBeforeEpoch.maturity}) · λ~${analysis.wavelengthM}m`;

  const afterSubLabel =
    compareHorizon === 'forecast'
      ? `FFT Δ +${analysis.measuredShiftM.toFixed(1)}m @ ${analysis.measuredSpeedMYr.toFixed(1)} m/yr`
      : `FFT Δ +${analysis.measuredShiftM.toFixed(1)}m (${pairSpanDays}d${pairBridgesGap ? ' · gap' : ''})`;

  useEffect(() => {
    if (!open) return;
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;

    if (beforeRef.current) {
      paintAnalysisPatch(beforeRef.current, offscreen, analysis, {
        cssW: stageSize.w,
        cssH: stageSize.h,
        isAfter: false,
        hasTargetPin: Boolean(poi || isCustom),
        targetColor: poi ? '#fb7185' : '#22d3ee',
      });
    }
    if (afterRef.current) {
      paintAnalysisPatch(afterRef.current, offscreen, analysis, {
        cssW: stageSize.w,
        cssH: stageSize.h,
        isAfter: true,
        hasTargetPin: Boolean(poi || isCustom),
        targetColor: poi ? '#fb7185' : '#22d3ee',
      });
    }
  }, [open, analysis, poi, isCustom, stageSize.w, stageSize.h]);

  if (!open) return null;

  const quickExamples = allPois.slice(0, 4);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/78 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="before-after-title"
      data-testid="before-after-modal"
    >
      <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-[#0b0f18] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-3.5">
          <div>
            <div className="text-[11px] font-mono text-cyan-400">
              Live Per-Spot L-Band 2D FFT Comparator · 512m × 512m Aperture
            </div>
            <h2 id="before-after-title" className="mt-0.5 text-base font-bold text-slate-50">
              {title}
            </h2>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">{subtitle}</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close before and after comparator"
            className="rounded border border-slate-700 bg-slate-900 p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mode toggle + Quick Spot / POI Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#080b12] px-5 py-2">
          <div
            role="group"
            aria-label="Comparison horizon mode"
            className="inline-flex flex-wrap rounded border border-slate-800 bg-slate-900 p-0.5"
          >
            <button
              type="button"
              onClick={() => setCompareHorizon('custom')}
              aria-pressed={compareHorizon === 'custom'}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                compareHorizon === 'custom'
                  ? 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Date Pair ({pairSpanDays}d)
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareHorizon('step');
                setCustomBeforeIdx(pairBeforeIdx);
                setCustomAfterIdx(pairAfterIdx);
              }}
              aria-pressed={compareHorizon === 'step'}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                compareHorizon === 'step'
                  ? pairAfterEpoch.hasGapBefore
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Step ({stepDays}d{pairAfterEpoch.hasGapBefore ? ' Gap' : ''})
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareHorizon('cumulative');
                setCustomBeforeIdx(0);
                setCustomAfterIdx(pairAfterIdx);
              }}
              aria-pressed={compareHorizon === 'cumulative'}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                compareHorizon === 'cumulative'
                  ? 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Cumul. ({cumulDays}d)
            </button>
            <button
              type="button"
              onClick={() => setCompareHorizon('forecast')}
              aria-pressed={compareHorizon === 'forecast'}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                compareHorizon === 'forecast'
                  ? 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              +{Math.min(horizonYears, 5)} yr Forecast
            </button>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
            {pickedSpots.map((spot, i) => {
              const active = !poi && customPoint?.id === spot.id;
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => onSwitchCustomSpot(spot)}
                  className={`rounded border px-2 py-1 whitespace-nowrap font-mono transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-400 bg-amber-400/15 text-amber-200 font-semibold'
                      : 'border-slate-800 bg-slate-900 text-amber-300/80 hover:text-amber-200'
                  }`}
                >
                  Spot #{i + 1}
                </button>
              );
            })}

            {quickExamples.map((example) => {
              const active = poi?.id === example.id;
              return (
                <button
                  key={example.id}
                  type="button"
                  onClick={() => onSwitchPoi(example)}
                  className={`rounded border px-2 py-1 whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200 font-semibold'
                      : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {example.name.split(' ')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom NISAR Acquisition Date Pair Picker */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-[#070a11] px-5 py-2 text-[11px]">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="compare-before-date" className="font-mono text-slate-400">
              Before
            </label>
            <select
              id="compare-before-date"
              value={activeBeforeIdx}
              onChange={(e) => {
                const nextBefore = Number(e.target.value);
                setCustomBeforeIdx(nextBefore);
                if (nextBefore >= activeAfterIdx) {
                  setCustomAfterIdx(Math.min(OBSERVATION_EPOCHS.length - 1, nextBefore + 1));
                } else {
                  setCustomAfterIdx(activeAfterIdx);
                }
                setCompareHorizon('custom');
              }}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              {OBSERVATION_EPOCHS.slice(0, -1).map((ep, idx) => (
                <option key={ep.id} value={idx}>
                  {ep.date} (T+{ep.daysSinceBaseline}d · {ep.maturity})
                </option>
              ))}
            </select>

            <span className="font-mono text-slate-500" aria-hidden="true">
              →
            </span>

            <label htmlFor="compare-after-date" className="font-mono text-cyan-300">
              After
            </label>
            <select
              id="compare-after-date"
              value={activeAfterIdx}
              onChange={(e) => {
                const nextAfter = Number(e.target.value);
                setCustomAfterIdx(nextAfter);
                if (nextAfter <= activeBeforeIdx) {
                  setCustomBeforeIdx(Math.max(0, nextAfter - 1));
                } else {
                  setCustomBeforeIdx(activeBeforeIdx);
                }
                setCompareHorizon('custom');
              }}
              className="rounded border border-cyan-500/40 bg-slate-900 px-2 py-1 font-mono text-[11px] text-cyan-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              {OBSERVATION_EPOCHS.slice(1).map((ep, offsetIdx) => {
                const idx = offsetIdx + 1;
                return (
                  <option key={ep.id} value={idx}>
                    {ep.date} (T+{ep.daysSinceBaseline}d · {ep.maturity})
                  </option>
                );
              })}
            </select>
          </div>

          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] tabular-nums ${
              compareHorizon === 'forecast'
                ? 'border-slate-700 bg-slate-900 text-slate-400'
                : pairBridgesGap
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
            }`}
          >
            {compareHorizon === 'forecast'
              ? `Forecast baseline: ${activeBeforeEpoch.date} + ${Math.min(horizonYears, 5)} yr`
              : `Span: Δt ${pairSpanDays}d${pairBridgesGap ? ' · Bridges 15d Gap' : ''}`}
          </span>
        </div>

        {/* Interactive On-Image Slider Comparison Stage */}
        <div
          ref={stageRef}
          onPointerDown={(e) => {
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
            updateSplitFromClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            updateSplitFromClientX(e.clientX);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          className="relative h-[300px] sm:h-[340px] w-full bg-[#06090f] select-none overflow-hidden cursor-ew-resize touch-none"
        >
          {/* After layer full background */}
          <canvas
            ref={afterRef}
            className="absolute inset-0 h-full w-full"
          />

          {/* Crisp DOM badge for AFTER/FORECAST */}
          <div className="pointer-events-none absolute top-3 right-3 rounded border border-cyan-400/50 bg-[#07090e]/90 px-2.5 py-1.5 backdrop-blur-sm">
            <div className="font-mono text-[11px] font-semibold leading-tight text-cyan-300">
              {afterDateLabel}
            </div>
            <div className="mt-0.5 font-mono text-[10px] leading-tight text-slate-400 tabular-nums">
              {afterSubLabel}
            </div>
          </div>

          {/* Before layer clipped to left splitPct */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
          >
            <canvas
              ref={beforeRef}
              className="h-full w-full"
            />
            <div className="pointer-events-none absolute top-3 left-3 rounded border border-slate-400/40 bg-[#07090e]/90 px-2.5 py-1.5 backdrop-blur-sm">
              <div className="font-mono text-[11px] font-semibold leading-tight text-slate-50">
                BEFORE · {beforeDateLabel}
              </div>
              <div className="mt-0.5 font-mono text-[10px] leading-tight text-slate-400 tabular-nums">
                {beforeSubLabel}
              </div>
            </div>
          </div>

          {/* Crisp DOM 100 m ground metric scale bar */}
          <div className="pointer-events-none absolute bottom-3 left-3 rounded border border-slate-800 bg-[#07090e]/88 px-2.5 py-1.5">
            <div className="font-mono text-[10px] font-semibold leading-none text-slate-100 mb-1">
              100 m
            </div>
            <div
              className="h-1.5 border-x-2 border-b-2 border-slate-200"
              style={{ width: `${Math.round(100 * (stageSize.w / analysis.patchSpanM))}px` }}
            />
          </div>

          {/* Interactive vertical divider + on-image draggable slider handle */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Drag left or right to compare before and after radar imagery"
            aria-valuemin={4}
            aria-valuemax={96}
            aria-valuenow={splitPct}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setSplitPct((p) => Math.max(4, p - 4));
              if (e.key === 'ArrowRight') setSplitPct((p) => Math.min(96, p + 4));
            }}
            className="absolute top-0 bottom-0 -translate-x-1/2 flex items-center justify-center focus:outline-none group"
            style={{ left: `${splitPct}%` }}
          >
            <div className="h-full w-0.5 bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.85)]" />
            <div className="absolute h-9 w-9 rounded-full border-2 border-cyan-300 bg-[#090d14]/95 text-cyan-300 flex items-center justify-center shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-cyan-400">
              <MoveHorizontal className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Live Per-Spot FFT Quantitative Telemetry Strip */}
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-800 bg-[#090d14] px-5 py-3.5 text-xs">
          <div>
            <dt className="text-slate-400">Live 2D FFT Drift</dt>
            <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-100">
              {analysis.measuredSpeedMYr.toFixed(1)} m/yr @ {analysis.measuredAzimuthDeg.toFixed(0)}°
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Measured Crest Shift</dt>
            <dd className="mt-0.5 font-mono font-semibold tabular-nums text-cyan-300">
              +{analysis.measuredShiftM.toFixed(1)} m (r={analysis.correlationPeak.toFixed(2)})
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">
              {poi ? 'Encroachment / Breach ETA' : 'Spot SNR / Wavelength'}
            </dt>
            <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-100">
              {poi
                ? `${poi.collision_risk} · ${formatTMin(poi.t_min_years, poi.t_min_months)}`
                : `${analysis.snrDb.toFixed(1)} dB · λ ${analysis.wavelengthM}m`}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">On-the-Go Compute</dt>
            <dd className="mt-0.5 font-mono text-slate-300">
              {compareHorizon !== 'forecast' && pairBridgesGap
                ? `Gap-compensated ${pairSpanDays}d · ${analysis.computeMs} ms`
                : `${splitPct}% Split · ${analysis.computeMs} ms FFT`}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
