import { useState } from 'react';
import { Check, Copy, Server } from 'lucide-react';
import { probeFastApiHealth } from '../services/api';
import type { DataSourceMode } from '../types/geospatial';

interface BackendGuideViewProps {
  apiBaseUrl: string;
  sourceMode: DataSourceMode;
  onUpdateApiUrl: (nextUrl: string) => void;
}

const UBUNTU_COMMANDS = `# 1. Inside space-challenge/ on Ubuntu (PyCharm SSH terminal)
cd ~/space-challenge
echo "Token length: \${#EARTHDATA_TOKEN}"   # should be > 100 if exported

# 2. Check live NASA Earthdata authentication & NISAR granules
curl -s http://localhost:8000/api/token-status

# 3. One-command launcher / restarter (FastAPI :8000 + React :3000)
chmod +x start.sh && ./start.sh`;

export function BackendGuideView({
  apiBaseUrl,
  sourceMode,
  onUpdateApiUrl,
}: BackendGuideViewProps) {
  const [draftUrl, setDraftUrl] = useState(apiBaseUrl);
  const [probeMessage, setProbeMessage] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleTestConnection(e: React.FormEvent) {
    e.preventDefault();
    setProbing(true);
    const cleaned = draftUrl.trim().replace(/\/+$/, '') || 'http://localhost:8000';
    onUpdateApiUrl(cleaned);
    const result = await probeFastApiHealth(cleaned);
    setProbeMessage(result.message);
    setProbing(false);
  }

  async function handleCopyCommands() {
    try {
      await navigator.clipboard.writeText(UBUNTU_COMMANDS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-[#07090e] p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h1 className="text-xl font-bold text-slate-50">
            EC2 Python 3.14 &amp; FastAPI Connection
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Connect this React interface to your remote AWS EC2 t3.2xlarge FastAPI backend running
            xarray, Dask (8 workers), GeoPandas, and SQLite.
          </p>
        </div>

        {/* Endpoint connection form */}
        <section className="rounded-lg border border-slate-800 bg-[#0b0f18] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-cyan-400" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-100">FastAPI Backend Endpoint</h2>
            </div>
            <span className="font-mono text-xs text-slate-400">
              Active source: {sourceMode === 'fastapi' ? 'Live FastAPI' : 'Local SAR Fallback'}
            </span>
          </div>

          <form onSubmit={handleTestConnection} className="mt-4 flex flex-col sm:flex-row gap-3">
            <label htmlFor="fastapi-url-input" className="sr-only">
              FastAPI Base URL
            </label>
            <input
              id="fastapi-url-input"
              type="url"
              required
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="http://localhost:8000"
              className="flex-1 rounded border border-slate-800 bg-[#07090e] px-3 py-2 font-mono text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={probing}
              className="rounded bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
            >
              {probing ? 'Testing...' : 'Save & Test Endpoint'}
            </button>
          </form>

          {probeMessage && (
            <p className="mt-3 font-mono text-xs text-cyan-300">{probeMessage}</p>
          )}
        </section>

        {/* Architecture constraints & terminal launch commands */}
        <section className="rounded-lg border border-slate-800 bg-[#0b0f18] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-100">
              Ubuntu Launch &amp; Restart Commands
            </h2>
            <button
              type="button"
              onClick={handleCopyCommands}
              className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span>Copy Commands</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto rounded border border-slate-800 bg-[#05070c] p-4 font-mono text-xs leading-relaxed text-slate-200">
            <code>{UBUNTU_COMMANDS}</code>
          </pre>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800 text-xs">
            <div>
              <div className="font-semibold text-slate-100">engine.py (NISAR + Dask)</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                Streams NISAR L2 GSLC subsets lazily via earthaccess + fsspec + xarray (1024px chunks)
                and runs 2D FFT cross-correlation across 8 Dask workers.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-100">db_manager.py (SQLite + GeoPandas)</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                Stores Saudi infrastructure POIs in SQLite, transforms coordinates to UTM Zone 38N,
                and projects wind-adjusted T-min &amp; collision probability.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-100">main.py (FastAPI + CORS)</div>
              <p className="mt-1 text-slate-400 leading-relaxed">
                Exposes /api/drift-vectors, /api/pois, and /api/simulate JSON endpoints with CORS
                enabled for React Leaflet telemetry.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
