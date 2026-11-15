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
 * Renders an actual 64x64 Float32 SAR backscatter array into a crisp bilinearly smoothed
 * radar comparator frame with a true 100 m ground scale bar and measured FFT shift vector.
 */
function paintAnalysisPatch(
  canvas: HTMLCanvasElement,
  analysis: SpotSarAnalysis,
  options: {
    isAfter: boolean;
    label: string;
    subLabel: string;
    hasTargetPin: boolean;
    targetColor: string;
  }
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const srcW = analysis.visualW;
  const srcH = analysis.visualH;
  const src = options.isAfter ? analysis.afterVisual : analysis.beforeVisual;

  ctx.clearRect(0, 0, w, h);

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

      const vTop = v00 + (v10 - v00) * fx;
      const vBot = v01 + (v11 - v01) * fx;
      const intensity = vTop + (vBot - vTop) * fy;

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

  // Subtle 100 m UTM metric reference grid
  const pxPerMeter = w / analysis.patchSpanM;
  const gridStepPx = 100 * pxPerMeter;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.13)';
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
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
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
    ctx.lineWidth = 1.5;
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

  // Stamp crisp 100 m ground metric scale bar in bottom-left
  const barPx = 100 * pxPerMeter;
  const barX = 14;
  const barY = h - 18;
  ctx.fillStyle = 'rgba(7, 9, 14, 0.78)';
  ctx.fillRect(barX - 6, barY - 18, barPx + 12, 26);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY);
  ctx.lineTo(barX + barPx, barY);
  ctx.lineTo(barX + barPx, barY - 4);
  ctx.stroke();
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 10px "IBM Plex Mono", monospace';
  ctx.fillText('100 m', barX + 4, barY - 5);

  // Corner timestamp badge: top-left for BEFORE, top-right for AFTER/FORECAST
  const boxW = 224;
  const boxX = options.isAfter ? w - boxW - 12 : 12;
  ctx.fillStyle = 'rgba(7, 9, 14, 0.88)';
  ctx.fillRect(boxX, 12, boxW, 42);
  ctx.strokeStyle = options.isAfter ? 'rgba(34, 211, 238, 0.5)' : 'rgba(148, 163, 184, 0.4)';
  ctx.strokeRect(boxX, 12, boxW, 42);

  ctx.fillStyle = options.isAfter ? '#67e8f9' : '#f8fafc';
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  ctx.fillText(options.label, boxX + 8, 29);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 10px "IBM Plex Mono", monospace';
  ctx.fillText(options.subLabel, boxX + 8, 45);
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
  const [splitPct, setSplitPct] = useState(50);
  const [compareHorizon, setCompareHorizon] = useState<'step' | 'cumulative' | 'forecast'>('forecast');
  const [dragging, setDragging] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);

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

  const elapsedYears =
    compareHorizon === 'step'
      ? stepDays / 365.25
      : compareHorizon === 'cumulative'
        ? cumulDays / 365.25
        : Math.min(horizonYears, 5);

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
      }),
    [targetLat, targetLon, inputSpeed, inputAzimuth, targetErg, elapsedYears]
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
    const baseline = OBSERVATION_EPOCHS[0];
    const beforeDateLabel =
      compareHorizon === 'step' ? pairBeforeEpoch.date : baseline.date;
    const afterDateLabel =
      compareHorizon === 'step'
        ? `AFTER · ${pairAfterEpoch.date}`
        : compareHorizon === 'cumulative'
          ? `AFTER · ${epoch.date}`
          : `FORECAST · +${Math.min(horizonYears, 5)} YR`;

    const afterSubLabel =
      compareHorizon === 'step'
        ? `FFT Δ +${analysis.measuredShiftM.toFixed(1)}m (Δt ${stepDays}d${pairAfterEpoch.hasGapBefore ? ' gap' : ''})`
        : compareHorizon === 'cumulative'
          ? `FFT Δ +${analysis.measuredShiftM.toFixed(1)}m (${cumulDays}d)`
          : `FFT Δ +${analysis.measuredShiftM.toFixed(1)}m @ ${analysis.measuredSpeedMYr.toFixed(1)} m/yr`;

    if (beforeRef.current) {
      paintAnalysisPatch(beforeRef.current, analysis, {
        isAfter: false,
        label: `BEFORE · ${beforeDateLabel}`,
        subLabel: `${analysis.patchSpanM}m SAR Patch · λ~${analysis.wavelengthM}m`,
        hasTargetPin: Boolean(poi || isCustom),
        targetColor: poi ? '#fb7185' : '#22d3ee',
      });
    }
    if (afterRef.current) {
      paintAnalysisPatch(afterRef.current, analysis, {
        isAfter: true,
        label: afterDateLabel,
        subLabel: afterSubLabel,
        hasTargetPin: Boolean(poi || isCustom),
        targetColor: poi ? '#fb7185' : '#22d3ee',
      });
    }
  }, [
    open,
    analysis,
    poi,
    isCustom,
    compareHorizon,
    epoch.date,
    pairBeforeEpoch.date,
    pairAfterEpoch.date,
    pairAfterEpoch.hasGapBefore,
    stepDays,
    cumulDays,
    horizonYears,
  ]);

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
            className="inline-flex rounded border border-slate-800 bg-slate-900 p-0.5"
          >
            <button
              type="button"
              onClick={() => setCompareHorizon('step')}
              aria-pressed={compareHorizon === 'step'}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                compareHorizon === 'step'
                  ? pairAfterEpoch.hasGapBefore
                    ? 'bg-amber-400 text-slate-950 font-semibold'
                    : 'bg-cyan-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Step Pair ({stepDays}d{pairAfterEpoch.hasGapBefore ? ' Gap' : ''})
            </button>
            <button
              type="button"
              onClick={() => setCompareHorizon('cumulative')}
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
            width={720}
            height={340}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Before layer clipped to left splitPct */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
          >
            <canvas
              ref={beforeRef}
              width={720}
              height={340}
              className="h-full w-full object-cover"
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
              {compareHorizon === 'step' && pairAfterEpoch.hasGapBefore
                ? `Gap-compensated ${stepDays}d Δt`
                : `${splitPct}% Split · ${analysis.computeMs} ms FFT`}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
