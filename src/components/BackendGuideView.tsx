import { useState } from 'react';
import { Check, Copy, Server } from 'lucide-react';
import { probeFastApiHealth } from '../services/api';
import type { DataSourceMode } from '../types/geospatial';

interface BackendGuideViewProps {
  apiBaseUrl: string;
  sourceMode: DataSourceMode;
  onUpdateApiUrl: (nextUrl: string) => void;
}

const UBUNTU_COMMANDS = `# 1. On AWS EC2 t3.2xlarge (Ubuntu, Python 3.14, 8 vCPUs, 32GB RAM, 30GB disk)
cd backend
python3.14 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip && pip install -r requirements.txt

# 2. Export NASA Earthdata bearer token (never writes large HDF5 granules to disk)
export EARTHDATA_TOKEN="your_earthdata_bearer_token"

# 3. Launch FastAPI backend + React frontend simultaneously
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 &
cd .. && npm install && VITE_API_BASE_URL=http://localhost:8000 npm run dev`;

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
    <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="border-b border-slate-200 pb-4">
          <h1 className="text-xl font-bold text-slate-900">
            EC2 Python 3.14 &amp; FastAPI Connection
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Connect this React interface to your remote AWS EC2 t3.2xlarge FastAPI backend running
            xarray, Dask (8 workers), GeoPandas, and SQLite.
          </p>
        </div>

        {/* Endpoint connection form */}
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <h2 className="text-sm font-bold text-slate-900">FastAPI Backend Endpoint</h2>
            </div>
            <span className="font-mono text-xs text-slate-600">
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
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={probing}
              className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap cursor-pointer"
            >
              {probing ? 'Testing...' : 'Save & Test Endpoint'}
            </button>
          </form>

          {probeMessage && (
            <p className="mt-3 font-mono text-xs text-slate-700">{probeMessage}</p>
          )}
        </section>

        {/* Architecture constraints & terminal launch commands */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">
              Ubuntu Simultaneous Launch Commands
            </h2>
            <button
              type="button"
              onClick={handleCopyCommands}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>Copy Commands</span>
                </>
              )}
            </button>
          </div>

          <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">
            <code>{UBUNTU_COMMANDS}</code>
          </pre>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-xs">
            <div>
              <div className="font-semibold text-slate-900">engine.py (NISAR + Dask)</div>
              <p className="mt-1 text-slate-600 leading-relaxed">
                Streams NISAR L2 GSLC subsets lazily via earthaccess + fsspec + xarray (1024px chunks)
                and runs 2D FFT cross-correlation across 8 Dask workers.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">db_manager.py (SQLite + GeoPandas)</div>
              <p className="mt-1 text-slate-600 leading-relaxed">
                Stores Saudi infrastructure POIs in SQLite, transforms coordinates to UTM Zone 38N,
                and projects wind-adjusted T-min &amp; collision probability.
              </p>
            </div>
            <div>
              <div className="font-semibold text-slate-900">main.py (FastAPI + CORS)</div>
              <p className="mt-1 text-slate-600 leading-relaxed">
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
