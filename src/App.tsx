import { useEffect, useMemo, useState } from 'react';
import { BackendGuideView } from './components/BackendGuideView';
import { BeforeAfterModal } from './components/BeforeAfterModal';
import { ControlSidebar } from './components/ControlSidebar';
import { DuneMapStage } from './components/DuneMapStage';
import { PresentationView } from './components/PresentationView';
import { RiskMatrixView } from './components/RiskMatrixView';
import { TopNav } from './components/TopNav';
import { OBSERVATION_EPOCHS } from './data/ergRegions';
import {
  fetchSimulationData,
  getStoredApiBaseUrl,
  setStoredApiBaseUrl,
} from './services/api';
import type {
  AppView,
  BaseMapStyle,
  CustomComparePoint,
  DataSourceMode,
  DriftVector,
  ErgZoneName,
  LayerToggles,
  PoiRisk,
  RiskTier,
  WindForcing,
} from './types/geospatial';
import {
  applyWindToVectors,
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  exportPoisToCsv,
  generateCalibratedDriftField,
  getEpochAdjustedWind,
  SEED_POIS,
} from './utils/riskEngine';

const INITIAL_BASE_VECTORS = generateCalibratedDriftField();
const DEFAULT_EPOCH_INDEX = OBSERVATION_EPOCHS.length - 1;

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('map');
  const [selectedErg, setSelectedErg] = useState<'All' | ErgZoneName>('All');
  const [baseMap, setBaseMap] = useState<BaseMapStyle>('satellite');
  const [layers, setLayers] = useState<LayerToggles>({
    heatmap: true,
    vectors: true,
    sarSwath: true,
    ergBounds: true,
  });

  const [riskFilter, setRiskFilter] = useState<'All' | RiskTier>('All');
  const [wind, setWind] = useState<WindForcing>(DEFAULT_WIND_FORCING);
  const [epochIndex, setEpochIndex] = useState<number>(DEFAULT_EPOCH_INDEX);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => getStoredApiBaseUrl());
  const [vectors, setVectors] = useState<DriftVector[]>(() =>
    applyWindToVectors(
      INITIAL_BASE_VECTORS,
      DEFAULT_WIND_FORCING,
      OBSERVATION_EPOCHS[DEFAULT_EPOCH_INDEX]
    )
  );
  const [pois, setPois] = useState<PoiRisk[]>(() =>
    evaluatePoiRisks(
      INITIAL_BASE_VECTORS,
      getEpochAdjustedWind(DEFAULT_WIND_FORCING, OBSERVATION_EPOCHS[DEFAULT_EPOCH_INDEX])
    )
  );
  const [sourceMode, setSourceMode] = useState<DataSourceMode>('local_model');
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [pickedSpots, setPickedSpots] = useState<CustomComparePoint[]>([]);
  const [customComparePoint, setCustomComparePoint] = useState<CustomComparePoint | null>(null);
  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [comparePoi, setComparePoi] = useState<PoiRisk | null>(null);

  const activeEpoch = OBSERVATION_EPOCHS[epochIndex] ?? OBSERVATION_EPOCHS[DEFAULT_EPOCH_INDEX];

  // Auto-advance 12-day timeline when playing
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      setEpochIndex((prev) => (prev + 1) % OBSERVATION_EPOCHS.length);
    }, 1200);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  useEffect(() => {
    let cancelled = false;
    const epochWind = getEpochAdjustedWind(wind, activeEpoch);

    setVectors(applyWindToVectors(INITIAL_BASE_VECTORS, wind, activeEpoch));
    setPois(evaluatePoiRisks(INITIAL_BASE_VECTORS, epochWind));

    const timer = window.setTimeout(async () => {
      const res = await fetchSimulationData(epochWind, apiBaseUrl);
      if (!cancelled) {
        if (res.sourceMode === 'fastapi') {
          setVectors(applyWindToVectors(res.vectors, wind, activeEpoch));
          setPois(res.pois);
        }
        setSourceMode(res.sourceMode);
      }
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wind, activeEpoch, apiBaseUrl]);

  const filteredPois = useMemo(() => {
    const allowedIds =
      selectedErg === 'All'
        ? null
        : new Set(SEED_POIS.filter((s) => s.ergZone === selectedErg).map((s) => s.id));

    return pois.filter((p) => {
      if (allowedIds && !allowedIds.has(p.id)) return false;
      if (riskFilter !== 'All' && p.collision_risk !== riskFilter) return false;
      return true;
    });
  }, [pois, riskFilter, selectedErg]);

  function handleExportCsv() {
    const csv = exportPoisToCsv(filteredPois);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dunemarch-ksa-encroachment-${activeEpoch.date}-${wind.speed_kt}kt.csv`;
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
    setSelectedErg('All');
    setRiskFilter('All');
    setSelectedPoiId(poiId);
    setActiveView('map');
  }

  function handleOpenComparisonForPoi(poi: PoiRisk | null) {
    if (poi) {
      setCustomComparePoint(null);
    }
    setComparePoi(poi);
    setCompareOpen(true);
  }

  function handlePickCustomPoint(pt: CustomComparePoint) {
    setComparePoi(null);
    setPickedSpots((prev) => [...prev.slice(-5), pt]);
    setCustomComparePoint(pt);
    setCompareMode(false);
    setCompareOpen(true);
  }

  function handleSelectCustomSpot(pt: CustomComparePoint) {
    setComparePoi(null);
    setCustomComparePoint(pt);
    setCompareOpen(true);
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#07090e] text-slate-100">
      <TopNav
        activeView={activeView}
        onSelectView={setActiveView}
        onExportCsv={handleExportCsv}
      />

      {activeView === 'map' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <ControlSidebar
            selectedErg={selectedErg}
            onSelectErg={(erg) => {
              setSelectedPoiId(null);
              setSelectedErg(erg);
            }}
            layers={layers}
            onChangeLayers={setLayers}
            baseMap={baseMap}
            onChangeBaseMap={setBaseMap}
            riskFilter={riskFilter}
            onChangeRiskFilter={setRiskFilter}
            wind={wind}
            onChangeWind={setWind}
            onResetWind={() => setWind(DEFAULT_WIND_FORCING)}
            pois={filteredPois}
            totalPois={pois}
            selectedPoiId={selectedPoiId}
            onSelectPoi={(id) => setSelectedPoiId(id)}
            onComparePoi={handleOpenComparisonForPoi}
            sourceMode={sourceMode}
          />
          <main className="flex-1 min-h-[520px] lg:min-h-0 relative">
            <DuneMapStage
              vectors={vectors}
              pois={filteredPois}
              layers={layers}
              baseMap={baseMap}
              selectedErg={selectedErg}
              onSelectErg={(erg) => {
                setSelectedPoiId(null);
                setSelectedErg(erg);
              }}
              selectedPoiId={selectedPoiId}
              onSelectPoi={(id) => setSelectedPoiId(id)}
              onComparePoi={handleOpenComparisonForPoi}
              compareMode={compareMode}
              onToggleCompareMode={() => setCompareMode((m) => !m)}
              pickedSpots={pickedSpots}
              activeCustomSpot={customComparePoint}
              onSelectCustomSpot={handleSelectCustomSpot}
              onPickCustomPoint={handlePickCustomPoint}
              epochIndex={epochIndex}
              epoch={activeEpoch}
              onChangeEpoch={(idx) => {
                setIsPlaying(false);
                setEpochIndex(idx);
              }}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying((p) => !p)}
              onOpenComparison={() =>
                handleOpenComparisonForPoi(
                  pois.find((p) => p.id === selectedPoiId) ?? null
                )
              }
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

      <BeforeAfterModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        poi={comparePoi}
        customPoint={customComparePoint}
        pickedSpots={pickedSpots}
        allPois={pois}
        onSwitchPoi={(next) => {
          setCustomComparePoint(null);
          setComparePoi(next);
        }}
        onSwitchCustomSpot={(spot) => {
          setComparePoi(null);
          setCustomComparePoint(spot);
        }}
        ergName={selectedErg}
        epoch={activeEpoch}
        horizonYears={wind.horizon_years}
      />
    </div>
  );
}
