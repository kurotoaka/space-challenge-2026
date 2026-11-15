import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  MapPin,
  Maximize2,
  Minimize2,
  Printer,
} from 'lucide-react';
import type { DriftVector, PoiRisk } from '../types/geospatial';
import { downloadPresentationPptx } from '../utils/pptxExport';
import { formatCoordinates, formatTMin } from '../utils/riskEngine';

interface PresentationViewProps {
  pois: PoiRisk[];
  vectors: DriftVector[];
  onOpenLiveMap: () => void;
}

const SLIDE_TITLES = [
  'Title',
  'Problem & Motivation',
  'Cloud SAR Pipeline',
  'Risk Projection Math',
  'Interactive Map Demo',
  'Risk Matrix & API',
  'Verification & Roadmap',
];

export function PresentationView({
  pois,
  vectors,
  onOpenLiveMap,
}: PresentationViewProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const totalSlides = SLIDE_TITLES.length;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

  const highPois = pois.filter((p) => p.collision_risk === 'High');
  const topUrgent = pois.slice(0, 3);
  const maxDrift = vectors.reduce((m, v) => Math.max(m, v.speed_m_yr), 0);

  return (
    <main
      ref={stageRef}
      className="flex-1 overflow-y-auto bg-[#07090e] p-4 md:p-6 flex flex-col items-center justify-between gap-4"
    >
      {/* Presentation toolbar */}
      <div className="no-print w-full max-w-5xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-100">Hackathon Deck</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-cyan-300">
            Slide {slideIndex + 1} / {totalSlides}
          </span>
          <span aria-hidden="true">·</span>
          <span>{SLIDE_TITLES[slideIndex]}</span>
        </div>

        <div className="flex items-center gap-2">
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
            <span>{exportingPptx ? 'Generating .pptx...' : 'Download .pptx'}</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>Print / PDF</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            )}
            <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* 16:9 Dark Slide Canvas */}
      <section
        aria-label={`Slide ${slideIndex + 1}: ${SLIDE_TITLES[slideIndex]}`}
        className="w-full max-w-5xl flex-1 min-h-[460px] rounded-xl border border-slate-800 bg-[#0b0f18] p-6 md:p-10 flex flex-col justify-between"
      >
        {slideIndex === 0 && (
          <div className="my-auto space-y-6">
            <div className="text-xs font-mono font-medium text-cyan-400">
              01. Hackathon Prototype · Kingdom of Saudi Arabia
            </div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-slate-50 max-w-3xl text-balance leading-tight">
              DuneMarch: SAR-Driven Dune Drift &amp; Infrastructure Risk Assessment
            </h1>
            <p className="text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed">
              Lazy-streaming NISAR Level-2 GSLC radar analysis, multi-date FFT crest displacement,
              and wind-adjusted sand encroachment risk across Saudi Arabia&apos;s four sand seas.
            </p>
            <div className="pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-slate-400">Radar Engine</div>
                <div className="mt-0.5 font-semibold text-slate-100">earthaccess + xarray + Dask</div>
              </div>
              <div>
                <div className="text-slate-400">Spatial Risk DB</div>
                <div className="mt-0.5 font-semibold text-slate-100">SQLite + GeoPandas (UTM 38N)</div>
              </div>
              <div>
                <div className="text-slate-400">Backend API</div>
                <div className="mt-0.5 font-semibold text-slate-100">FastAPI (Python 3.14)</div>
              </div>
              <div>
                <div className="text-slate-400">Target Node</div>
                <div className="mt-0.5 font-semibold text-slate-100">EC2 t3.2xlarge · 8 vCPUs · 30 GB</div>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 1 && (
          <div className="space-y-6 my-auto">
            <div>
              <div className="text-xs font-mono font-medium text-cyan-400">02. Problem &amp; Motivation</div>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                Static Maps Cannot Track Moving Deserts
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-bold text-slate-100">Infrastructure Exposure</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Mobile dunes across Rub&apos; al Khali, Al-Jafurah, Ad-Dahna, and An-Nafud migrate
                  up to <span className="font-mono font-semibold text-cyan-300">{maxDrift.toFixed(1)} m/yr</span>,
                  threatening oil/gas plants, freight rail, highways, and solar arrays.
                </p>
              </div>
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-bold text-slate-100">Cloud Storage Bottleneck</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Downloading raw multi-gigabyte NISAR HDF5 granules locally quickly saturates a
                  30 GB EC2 root volume and stalls rapid iteration.
                </p>
              </div>
              <div className="border-t border-slate-800 pt-4">
                <h3 className="text-sm font-bold text-slate-100">Our Solution</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">
                  Stream spatial subsets in memory, measure pixel-level displacement via 2D FFT,
                  and compute wind-adjusted Perimeter Breach ETA (<span className="font-mono text-slate-200">T-min</span>).
                </p>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 2 && (
          <div className="space-y-6 my-auto">
            <div>
              <div className="text-xs font-mono font-medium text-cyan-400">03. Data Pipeline (engine.py)</div>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                Zero-Download NISAR Streaming on 8 vCPUs
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-xs font-mono text-cyan-400">Step 1</div>
                <div className="mt-1 text-sm font-bold text-slate-100">Earthdata Query</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  <code className="font-mono text-slate-200">earthaccess.search_data</code> locates
                  sequential <code className="font-mono text-slate-200">NISAR_L2_GSLC</code> scenes
                  intersecting KSA bounds (<code className="font-mono text-slate-200">34.5°E–55.7°E</code>).
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-xs font-mono text-cyan-400">Step 2</div>
                <div className="mt-1 text-sm font-bold text-slate-100">Lazy Subset Streaming</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  <code className="font-mono text-slate-200">earthaccess.open()</code> +{' '}
                  <code className="font-mono text-slate-200">xarray</code> (1024×1024 chunks) pulls
                  only Saudi erg slices without saving raw files to disk.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-xs font-mono text-cyan-400">Step 3</div>
                <div className="mt-1 text-sm font-bold text-slate-100">8-Worker Dask Cluster</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  <code className="font-mono text-slate-200">LocalCluster(n_workers=8)</code> with{' '}
                  <code className="font-mono text-slate-200">OMP_NUM_THREADS=1</code> keeps 32 GB
                  RAM contention-free.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-xs font-mono text-cyan-400">Step 4</div>
                <div className="mt-1 text-sm font-bold text-slate-100">2D FFT Sub-Pixel Peak</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  Hann-windowed <code className="font-mono text-slate-200">rfft2</code>/{' '}
                  <code className="font-mono text-slate-200">irfft2</code> cross-correlation with
                  parabolic peak interpolation outputs (u, v) velocity (m/yr) and SNR.
                </p>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 3 && (
          <div className="space-y-6 my-auto">
            <div>
              <div className="text-xs font-mono font-medium text-cyan-400">04. Risk Math (db_manager.py)</div>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                Projecting Drift Vectors to Perimeter Breach ETA (T-min)
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-sm font-bold text-slate-100">Metric UTM Projection &amp; IDW</div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    SQLite + GeoPandas loads monitored Saudi POIs and transforms coordinates into
                    metric UTM Zone 38N (<code className="font-mono text-slate-200">EPSG:32638</code>)
                    for inverse-distance-weighted velocity interpolation.
                  </p>
                </div>
                <div className="border-b border-slate-800 pb-3">
                  <div className="text-sm font-bold text-slate-100">Wind Forcing Adjustment</div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Combines baseline SAR dune kinematics with dominant wind forcing to compute an
                    effective drift vector and Wind Influence multiplier.
                  </p>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">Closest Approach &amp; Probability</div>
                  <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                    Solves forward ray-to-perimeter intersection distance to output Perimeter Breach{' '}
                    <code className="font-mono text-slate-200">T-min</code>, Encroachment Probability %,
                    and ◆ High / ▲ Med / ● Low tiers.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-5 flex flex-col justify-center space-y-3">
                <div className="text-xs font-semibold text-slate-200">
                  Live Computed High-Risk Watchlist ({highPois.length} of {pois.length} POIs)
                </div>
                <ul className="divide-y divide-slate-800 text-xs">
                  {topUrgent.map((poi) => (
                    <li key={poi.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-100">{poi.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {formatCoordinates(poi.lat, poi.lon)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-rose-400">
                          ◆ {poi.collision_risk} ({poi.collision_probability_pct}%)
                        </div>
                        <div className="font-mono text-[11px] tabular-nums text-cyan-300">
                          T-min {formatTMin(poi.t_min_years, poi.t_min_months)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 4 && (
          <div className="space-y-6 my-auto">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-medium text-cyan-400">05. Interactive Frontend</div>
                <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                  Dark SAR Map, Time Scrubber &amp; Before/After Wipe
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenLiveMap}
                className="no-print inline-flex items-center gap-1.5 rounded bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Open Live Map</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-sm font-bold text-slate-100">1. Erg-Clipped High-Res Heatmap</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  Satellite dune imagery under a dark KSA mask with high-resolution IDW velocity
                  heatmaps clipped cleanly to Saudi Arabia&apos;s four separate erg regions.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-sm font-bold text-slate-100">2. Crisp Directional Field</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  High-DPI Canvas micro-vector arrows ({vectors.length} grid cells) reveal exact
                  transport direction across each sand sea alongside multi-date L-band SAR swaths.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-4">
                <div className="text-sm font-bold text-slate-100">3. Timeline &amp; Before/After</div>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
                  Scrub across 12-day NISAR repeat passes or click inside any Erg to run a live 2D FFT
                  Before/After SAR comparison and track asset encroachment telemetry.
                </p>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 5 && (
          <div className="space-y-6 my-auto">
            <div>
              <div className="text-xs font-mono font-medium text-cyan-400">06. FastAPI &amp; Risk Matrix</div>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                Lightweight CORS Backend &amp; Multi-Asset Triage
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-100">FastAPI Endpoints (main.py)</h3>
                <ul className="space-y-2 font-mono text-xs text-slate-300">
                  <li>GET /api/health — Engine &amp; vector count status</li>
                  <li>GET /api/drift-vectors — SAR trajectory field JSON</li>
                  <li>GET /api/pois — Wind-adjusted POI risk rankings</li>
                  <li>POST /api/simulate — Live wind speed/bearing forecast</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-5 space-y-3">
                <h3 className="text-sm font-bold text-slate-100">Operational Matrix &amp; Export</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The <strong className="font-semibold text-slate-200">Risk Matrix</strong> tab
                  provides full-text search, risk tier filtering, tabular numeric alignment across
                  all {pois.length} Saudi assets, one-click map locating, and direct CSV export for
                  engineering dispatch.
                </p>
              </div>
            </div>
          </div>
        )}

        {slideIndex === 6 && (
          <div className="space-y-6 my-auto">
            <div>
              <div className="text-xs font-mono font-medium text-cyan-400">07. Verification &amp; Roadmap</div>
              <h2 className="mt-1.5 text-2xl md:text-3xl font-bold text-slate-50">
                Verified Prototype, Ready for Continuous SAR Operations
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-5">
                <h3 className="text-sm font-bold text-slate-100">Engineering Verification</h3>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <li>• Pure risk &amp; erg boundary math unit-tested (node:test, 6/6 passing).</li>
                  <li>• Python 3.14 backend syntax &amp; TypeScript Vite build verified cleanly.</li>
                  <li>• Headless Chromium verified on desktop (1440×900) and mobile (390×844) with 0 console errors.</li>
                </ul>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#080b12] p-5">
                <h3 className="text-sm font-bold text-slate-100">Post-Hackathon Roadmap</h3>
                <ul className="mt-2.5 space-y-2 text-xs text-slate-300 leading-relaxed">
                  <li>1. Automate 12-day repeat-pass NISAR L2 GSLC ingestion with EARTHDATA_TOKEN.</li>
                  <li>2. Assimilate ERA5 hourly wind vectors for seasonal Shamal sandstorm modeling.</li>
                  <li>3. Trigger automated perimeter alerts when any asset drops below T-min &lt; 12 mo.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Slide footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>DuneMarch · Saudi Dune Drift &amp; Risk Console</span>
          <span className="font-mono tabular-nums">
            {slideIndex + 1} / {totalSlides}
          </span>
        </div>
      </section>

      {/* Slide navigation controls */}
      <nav
        aria-label="Slide navigation"
        className="no-print w-full max-w-5xl flex flex-wrap items-center justify-between gap-3"
      >
        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
          disabled={slideIndex === 0}
          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          <span>Previous</span>
        </button>

        <div className="flex items-center gap-1.5" role="tablist" aria-label="Slides">
          {SLIDE_TITLES.map((title, idx) => {
            const active = idx === slideIndex;
            return (
              <button
                key={title}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Slide ${idx + 1}: ${title}`}
                onClick={() => setSlideIndex(idx)}
                className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded transition-colors cursor-pointer ${
                  active
                    ? 'bg-cyan-400 text-slate-950 font-semibold'
                    : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSlideIndex((i) => Math.min(totalSlides - 1, i + 1))}
          disabled={slideIndex === totalSlides - 1}
          className="inline-flex items-center gap-1 rounded bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </main>
  );
}
