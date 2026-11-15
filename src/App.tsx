import { useEffect, useMemo, useState } from 'react';
import { BackendGuideView } from './components/BackendGuideView';
import { ControlSidebar } from './components/ControlSidebar';
import { DuneMapStage } from './components/DuneMapStage';
import { PresentationView } from './components/PresentationView';
import { RiskMatrixView } from './components/RiskMatrixView';
import { TopNav } from './components/TopNav';
import {
  fetchSimulationData,
  getStoredApiBaseUrl,
  setStoredApiBaseUrl,
} from './services/api';
import type {
  AppView,
  DataSourceMode,
  DriftVector,
  PoiRisk,
  RiskTier,
  VisualizationMode,
  WindForcing,
} from './types/geospatial';
import {
  applyWindToVectors,
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  exportPoisToCsv,
  generateCalibratedDriftField,
} from './utils/riskEngine';

const INITIAL_BASE_VECTORS = generateCalibratedDriftField();

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('map');
  const [vizMode, setVizMode] = useState<VisualizationMode>('vectors');
  const [riskFilter, setRiskFilter] = useState<'All' | RiskTier>('All');
  const [wind, setWind] = useState<WindForcing>(DEFAULT_WIND_FORCING);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => getStoredApiBaseUrl());

  const [vectors, setVectors] = useState<DriftVector[]>(() =>
    applyWindToVectors(INITIAL_BASE_VECTORS, DEFAULT_WIND_FORCING)
  );
  const [pois, setPois] = useState<PoiRisk[]>(() =>
    evaluatePoiRisks(INITIAL_BASE_VECTORS, DEFAULT_WIND_FORCING)
  );
  const [sourceMode, setSourceMode] = useState<DataSourceMode>('local_model');
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Update local SAR vectors immediately while checking FastAPI backend in background
    setVectors(applyWindToVectors(INITIAL_BASE_VECTORS, wind));
    setPois(evaluatePoiRisks(INITIAL_BASE_VECTORS, wind));

    const timer = window.setTimeout(async () => {
      const res = await fetchSimulationData(wind, apiBaseUrl);
      if (!cancelled) {
        setVectors(res.vectors);
        setPois(res.pois);
        setSourceMode(res.sourceMode);
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wind, apiBaseUrl]);

  const filteredPois = useMemo(() => {
    if (riskFilter === 'All') return pois;
    return pois.filter((p) => p.collision_risk === riskFilter);
  }, [pois, riskFilter]);

  function handleExportCsv() {
    const csv = exportPoisToCsv(filteredPois);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dunemarch-ksa-dune-risk-${wind.speed_kt}kt.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleUpdateApiUrl(nextUrl: string) {
    const stored = setStoredApiBaseUrl(nextUrl, false);
    setApiBaseUrl(stored);
  }

  function handleInspectOnMap(poiId: string) {
    setRiskFilter('All');
    setSelectedPoiId(poiId);
    setActiveView('map');
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav
        activeView={activeView}
        onSelectView={setActiveView}
        onExportCsv={handleExportCsv}
      />

      {activeView === 'map' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <ControlSidebar
            vizMode={vizMode}
            onChangeVizMode={setVizMode}
            riskFilter={riskFilter}
            onChangeRiskFilter={setRiskFilter}
            wind={wind}
            onChangeWind={setWind}
            onResetWind={() => setWind(DEFAULT_WIND_FORCING)}
            pois={filteredPois}
            totalPois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={(id) => setSelectedPoiId(id)}
            sourceMode={sourceMode}
          />
          <main className="flex-1 min-h-[500px] lg:min-h-0 relative">
            <DuneMapStage
              vectors={vectors}
              pois={filteredPois}
              vizMode={vizMode}
              selectedPoiId={selectedPoiId}
              onSelectPoi={(id) => setSelectedPoiId(id)}
            />
          </main>
        </div>
      )}

      {activeView === 'matrix' && (
        <RiskMatrixView pois={pois} onInspectOnMap={handleInspectOnMap} />
      )}

      {activeView === 'deck' && (
        <PresentationView
          pois={pois}
          vectors={vectors}
          onOpenLiveMap={() => setActiveView('map')}
        />
      )}

      {activeView === 'backend' && (
        <BackendGuideView
          apiBaseUrl={apiBaseUrl}
          sourceMode={sourceMode}
          onUpdateApiUrl={handleUpdateApiUrl}
        />
      )}
    </div>
  );
}
