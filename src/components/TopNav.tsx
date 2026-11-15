import type { AppView } from '../types/geospatial';

interface TopNavProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onExportCsv: () => void;
}

const NAV_ITEMS: Array<{ id: AppView; label: string }> = [
  { id: 'map', label: 'Map Console' },
  { id: 'matrix', label: 'Risk Matrix' },
  { id: 'backend', label: 'EC2 & FastAPI' },
];

export function TopNav({ activeView, onSelectView, onExportCsv }: TopNavProps) {
  return (
    <header className="h-14 shrink-0 border-b border-slate-200 bg-white px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-5 lg:gap-8">
      {/* Zone 1: Single-element Brand Wordmark */}
      <a
        href="#map"
        onClick={(e) => {
          e.preventDefault();
          onSelectView('map');
        }}
        className="text-sm sm:text-base md:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
      >
        RimalTrack
      </a>

      {/* Zone 2: Concise single-line navigation links */}
      <nav aria-label="Primary" className="flex items-center gap-2.5 sm:gap-5 md:gap-7">
        {NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative py-4 text-[11px] sm:text-xs md:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'text-slate-900 font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600"
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
          className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Export CSV
        </button>
      </div>
    </header>
  );
}
