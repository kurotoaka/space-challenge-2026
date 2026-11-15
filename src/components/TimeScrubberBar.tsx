import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Crosshair,
  Pause,
  Play,
} from 'lucide-react';
import { OBSERVATION_EPOCHS } from '../data/ergRegions';
import type { NisarMaturityTier, ObservationEpoch } from '../types/geospatial';

interface TimeScrubberBarProps {
  epochIndex: number;
  onChangeEpoch: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
  onOpenComparison: () => void;
}

const MATURITY_BADGE_CLASS: Record<NisarMaturityTier, string> = {
  'Validated V1': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Provisional: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300',
  'Science Phase': 'border-slate-700 bg-slate-800/80 text-slate-300',
};

const GAP_INDEX = OBSERVATION_EPOCHS.findIndex((e) => e.hasGapBefore);
const JUL26_INDEX = Math.max(0, GAP_INDEX - 1);
const VALIDATED_START_INDEX = OBSERVATION_EPOCHS.findIndex((e) => e.maturity === 'Validated V1');

export function TimeScrubberBar({
  epochIndex,
  onChangeEpoch,
  isPlaying,
  onTogglePlay,
  compareMode,
  onToggleCompareMode,
  onOpenComparison,
}: TimeScrubberBarProps) {
  const epoch: ObservationEpoch = OBSERVATION_EPOCHS[epochIndex] ?? OBSERVATION_EPOCHS[0];
  const maxIndex = OBSERVATION_EPOCHS.length - 1;
  const gapPct = GAP_INDEX > 0 ? ((GAP_INDEX - 0.5) / maxIndex) * 100 : 70;
  const validatedPct =
    VALIDATED_START_INDEX > 0 ? (VALIDATED_START_INDEX / maxIndex) * 100 : 93;

  const milestones = [
    { idx: 0, text: "Nov 28 '25" },
    { idx: JUL26_INDEX, text: 'Jul 26' },
    { idx: GAP_INDEX > 0 ? GAP_INDEX : 21, text: 'Aug 10 (15d Gap)', isGap: true },
    { idx: VALIDATED_START_INDEX > 0 ? VALIDATED_START_INDEX : 27, text: 'Oct 21 (V1)' },
    { idx: maxIndex, text: 'Nov 14 (Latest)' },
  ];

  return (
    <div
      className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 z-[450] w-[calc(100%-1.5rem)] max-w-3xl rounded-lg border border-slate-800 bg-[#090d14]/94 backdrop-blur-md px-3 py-2 shadow-2xl"
      data-testid="time-scrubber-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause 12-day sequence' : 'Play 12-day NISAR sequence'}
            className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-slate-700 bg-slate-900 text-cyan-300 hover:bg-slate-800 hover:border-cyan-500/50 transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-200">
              <span className="font-semibold text-cyan-300">{epoch.date}</span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${MATURITY_BADGE_CLASS[epoch.maturity]}`}
              >
                {epoch.maturity}
              </span>
              <span className="tabular-nums text-slate-300">
                T+{epoch.daysSinceBaseline}d
                {epoch.stepDeltaDays > 0 ? ` (Δt ${epoch.stepDeltaDays}d)` : ' (Baseline)'}
              </span>
              {epoch.hasGapBefore && (
                <span
                  title={epoch.gapNote}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/45 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300"
                >
                  <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                  <span>Jul 27–Aug 10 Gap Bridged</span>
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 truncate hidden sm:block mt-0.5">
              {epoch.cloudFreeNote}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleCompareMode}
            aria-pressed={compareMode}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
              compareMode
                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/40'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{compareMode ? 'Click Map Spot...' : 'Pick Any Spot'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenComparison}
            className="inline-flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Before / After</span>
          </button>
        </div>
      </div>

      {/* 30-epoch mission timeline track + Jul 27–Aug 10 instrument outage gap marker */}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChangeEpoch(Math.max(0, epochIndex - 1))}
          disabled={epochIndex <= 0}
          aria-label="Previous NISAR acquisition"
          className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-cyan-300 hover:border-slate-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <div className="relative flex-1 flex items-center py-1">
          {/* Track background showing Validated V1 tail and outage gap notch */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded bg-slate-800 overflow-hidden">
            <div
              className="absolute inset-y-0 right-0 bg-emerald-500/40"
              style={{ left: `${validatedPct}%` }}
            />
            <div
              className="absolute inset-y-0 w-1.5 -translate-x-1/2 bg-amber-400"
              style={{ left: `${gapPct}%` }}
              title="NASA NISAR instrument gap: Jul 27 – Aug 10, 2026"
            />
          </div>

          <input
            type="range"
            min={0}
            max={maxIndex}
            step={1}
            value={epochIndex}
            onChange={(e) => onChangeEpoch(Number(e.target.value))}
            aria-label="NISAR acquisition timeline scrubber"
            className="relative z-10 w-full h-3 appearance-none bg-transparent cursor-pointer accent-cyan-400"
          />
        </div>

        <button
          type="button"
          onClick={() => onChangeEpoch(Math.min(maxIndex, epochIndex + 1))}
          disabled={epochIndex >= maxIndex}
          aria-label="Next NISAR acquisition"
          className="h-6 w-6 shrink-0 inline-flex items-center justify-center rounded border border-slate-800 bg-slate-900 text-slate-300 hover:text-cyan-300 hover:border-slate-700 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* Quick milestone anchors across Science Phase, Outage Gap, and Validated V1 */}
      <div
        className="mt-1.5 flex items-center justify-between gap-1 overflow-x-auto"
        role="group"
        aria-label="NISAR mission timeline milestones"
      >
        {milestones.map((m) => {
          const active = epochIndex === m.idx;
          return (
            <button
              key={m.idx}
              type="button"
              onClick={() => onChangeEpoch(m.idx)}
              aria-pressed={active}
              className={`rounded px-2 py-0.5 text-[10px] font-mono tabular-nums whitespace-nowrap transition-colors cursor-pointer border ${
                active
                  ? m.isGap
                    ? 'border-amber-400 bg-amber-400/20 text-amber-200 font-semibold'
                    : 'border-cyan-400 bg-cyan-400 text-slate-950 font-semibold'
                  : m.isGap
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {m.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
