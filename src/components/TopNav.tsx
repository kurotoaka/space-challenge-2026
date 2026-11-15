import type { AppView } from '../types/geospatial';

interface TopNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onExportCsv: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'map', label: 'Map' },
  { id: 'matrix', label: 'Matrix' },
  { id: 'deck', label: 'Deck' },
  { id: 'backend', label: 'EC2 API' },
];

export function TopNav({ activeView, onSelectView, onExportCsv }: TopNavProps) {
  return (
    <header className="h-12 shrink-0 border-b border-slate-800/90 bg-[#090d14] px-2.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-6 lg:gap-8">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#map"
        onClick={(e) => {
          e.preventDefault();
          onSelectView('map');
        }}
        className="text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500 rounded"
      >
        DuneMarch
      </a>

      {/* Zone 2: Clean single-line text navigation links */}
      <nav aria-label="Primary" className="flex items-center gap-2.5 sm:gap-6 md:gap-8">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-3.5 text-[11px] sm:text-xs md:text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan-500 ${
                isActive ? 'text-slate-50 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single primary action button */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onExportCsv}
          className="px-2 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          Export CSV
        </button>
      </div>
    </header>
  );
}
