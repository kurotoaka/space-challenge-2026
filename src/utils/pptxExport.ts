import PptxGenJS from 'pptxgenjs';
import type { DriftVector, PoiRisk } from '../types/geospatial';
import { formatCoordinates, formatTMin } from './riskEngine';

const COLORS = {
  bg: 'F8FAFC',
  white: 'FFFFFF',
  ink: '0F172A',
  muted: '475569',
  subtle: '64748B',
  border: 'CBD5E1',
  blue: '2563EB',
  rose: 'BE123C',
  amber: 'B45309',
  emerald: '047857',
  panel: 'F1F5F9',
};

function addSlideHeader(
  slide: PptxGenJS.Slide,
  kicker: string,
  title: string,
  slideNum: number
) {
  slide.background = { color: COLORS.bg };
  slide.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.08,
    fill: { color: COLORS.blue },
  });
  slide.addText(kicker, {
    x: 0.7,
    y: 0.42,
    w: 11.9,
    h: 0.3,
    fontFace: 'Calibri',
    fontSize: 11,
    bold: true,
    color: COLORS.blue,
  });
  slide.addText(title, {
    x: 0.7,
    y: 0.72,
    w: 11.9,
    h: 0.55,
    fontFace: 'Calibri',
    fontSize: 26,
    bold: true,
    color: COLORS.ink,
  });
  slide.addShape('line', {
    x: 0.7,
    y: 1.38,
    w: 11.93,
    h: 0,
    line: { color: COLORS.border, width: 1 },
  });

  // Footer
  slide.addText('DuneMarch · Saudi Dune Drift & Risk Console', {
    x: 0.7,
    y: 7.0,
    w: 8.0,
    h: 0.28,
    fontFace: 'Calibri',
    fontSize: 10,
    color: COLORS.subtle,
  });
  slide.addText(`${slideNum} / 7`, {
    x: 11.2,
    y: 7.0,
    w: 1.43,
    h: 0.28,
    align: 'right',
    fontFace: 'Consolas',
    fontSize: 10,
    color: COLORS.subtle,
  });
}

export function buildPresentationPptx(
  pois: PoiRisk[],
  vectors: DriftVector[]
): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'DuneMarch';
  pptx.title = 'DuneMarch — Saudi Dune Drift & Risk Assessment';
  pptx.subject = 'NISAR L2 GSLC Dune Drift Tracking & Collision Risk';

  const highPois = pois.filter((p) => p.collision_risk === 'High');
  const maxDrift = vectors.reduce((m, v) => Math.max(m, v.speed_m_yr), 0);

  // Slide 1: Title
  const s1 = pptx.addSlide();
  s1.background = { color: COLORS.white };
  s1.addShape('rect', {
    x: 0,
    y: 0,
    w: 13.333,
    h: 0.12,
    fill: { color: COLORS.blue },
  });
  s1.addText('01. Hackathon Prototype · Kingdom of Saudi Arabia', {
    x: 0.9,
    y: 1.35,
    w: 11.5,
    h: 0.35,
    fontFace: 'Consolas',
    fontSize: 12,
    bold: true,
    color: COLORS.blue,
  });
  s1.addText('DuneMarch: SAR-Driven Dune Drift\n& Infrastructure Risk Assessment', {
    x: 0.9,
    y: 1.85,
    w: 11.2,
    h: 1.65,
    fontFace: 'Calibri',
    fontSize: 40,
    bold: true,
    color: COLORS.ink,
    lineSpacingMultiple: 1.12,
  });
  s1.addText(
    'Lazy-streaming NISAR Level-2 GSLC radar analysis, wind-adjusted aeolian collision forecasting, and interactive Saudi geospatial risk telemetry.',
    {
      x: 0.9,
      y: 3.65,
      w: 10.4,
      h: 0.9,
      fontFace: 'Calibri',
      fontSize: 17,
      color: COLORS.muted,
    }
  );
  s1.addShape('line', {
    x: 0.9,
    y: 5.0,
    w: 11.53,
    h: 0,
    line: { color: COLORS.border, width: 1 },
  });

  const metaCols = [
    ['Radar Engine', 'earthaccess + xarray + Dask'],
    ['Spatial Risk DB', 'SQLite + GeoPandas (UTM 38N)'],
    ['Backend API', 'FastAPI (Python 3.14)'],
    ['Target Node', 'EC2 t3.2xlarge · 8 vCPUs · 30 GB'],
  ];
  metaCols.forEach(([label, val], idx) => {
    const x = 0.9 + idx * 2.95;
    s1.addText(label, {
      x,
      y: 5.2,
      w: 2.75,
      h: 0.28,
      fontFace: 'Calibri',
      fontSize: 11,
      color: COLORS.subtle,
    });
    s1.addText(val, {
      x,
      y: 5.48,
      w: 2.8,
      h: 0.38,
      fontFace: 'Calibri',
      fontSize: 13,
      bold: true,
      color: COLORS.ink,
    });
  });
  s1.addText('1 / 7', {
    x: 11.2,
    y: 7.0,
    w: 1.43,
    h: 0.28,
    align: 'right',
    fontFace: 'Consolas',
    fontSize: 10,
    color: COLORS.subtle,
  });

  // Slide 2: Problem & Motivation
  const s2 = pptx.addSlide();
  addSlideHeader(
    s2,
    '02. Problem & Motivation',
    'Static Maps Cannot Track Moving Deserts',
    2
  );
  const s2Cards = [
    [
      'Infrastructure Exposure',
      `Mobile dunes across Rub' al Khali, Al-Jafurah, Ad-Dahna, and An-Nafud migrate up to ${maxDrift.toFixed(1)} m/yr, threatening oil/gas plants, freight rail, highways, and solar arrays.`,
    ],
    [
      'Cloud Storage Bottleneck',
      'Downloading raw multi-gigabyte NISAR HDF5 granules locally quickly saturates a 30 GB EC2 root volume and stalls rapid hackathon iteration.',
    ],
    [
      'Our Solution',
      'Stream spatial subsets in memory, measure pixel-level displacement via 2D FFT, and compute wind-adjusted Time to Collision (T-min) for critical assets.',
    ],
  ];
  s2Cards.forEach(([heading, body], idx) => {
    const x = 0.7 + idx * 4.05;
    s2.addShape('roundRect', {
      x,
      y: 1.85,
      w: 3.82,
      h: 4.35,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
      rectRadius: 0.08,
    });
    s2.addText(heading, {
      x: x + 0.28,
      y: 2.15,
      w: 3.26,
      h: 0.4,
      fontFace: 'Calibri',
      fontSize: 17,
      bold: true,
      color: COLORS.ink,
    });
    s2.addText(body, {
      x: x + 0.28,
      y: 2.7,
      w: 3.26,
      h: 3.1,
      fontFace: 'Calibri',
      fontSize: 14,
      color: COLORS.muted,
      valign: 'top',
      lineSpacingMultiple: 1.28,
    });
  });

  // Slide 3: Cloud SAR Pipeline (engine.py)
  const s3 = pptx.addSlide();
  addSlideHeader(
    s3,
    '03. Data Pipeline (engine.py)',
    'Zero-Download NISAR Streaming on 8 vCPUs',
    3
  );
  const s3Steps = [
    [
      'Step 1 · Earthdata Query',
      'earthaccess.search_data locates sequential NISAR_L2_GSLC granules intersecting KSA bounds (34.5°E–55.7°E).',
    ],
    [
      'Step 2 · Lazy Streaming',
      'earthaccess.open() + xarray (h5netcdf, 1024×1024 chunks) streams only Saudi erg spatial slices — zero large files written to disk.',
    ],
    [
      'Step 3 · 8-Worker Dask',
      'LocalCluster(n_workers=8, memory_limit="3.2GB") with OMP_NUM_THREADS=1 maximizes CPU throughput within 32 GB RAM.',
    ],
    [
      'Step 4 · 2D FFT Peak',
      'Hann-windowed rfft2/irfft2 cross-correlation with parabolic peak interpolation outputs (u, v) velocity (m/yr) and SNR.',
    ],
  ];
  s3Steps.forEach(([heading, body], idx) => {
    const x = 0.7 + idx * 3.03;
    s3.addShape('roundRect', {
      x,
      y: 1.9,
      w: 2.84,
      h: 4.3,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
      rectRadius: 0.08,
    });
    s3.addText(heading, {
      x: x + 0.22,
      y: 2.2,
      w: 2.4,
      h: 0.45,
      fontFace: 'Calibri',
      fontSize: 15,
      bold: true,
      color: COLORS.blue,
    });
    s3.addText(body, {
      x: x + 0.22,
      y: 2.8,
      w: 2.4,
      h: 3.1,
      fontFace: 'Calibri',
      fontSize: 13.5,
      color: COLORS.muted,
      valign: 'top',
      lineSpacingMultiple: 1.28,
    });
  });

  // Slide 4: Spatial Risk Math (db_manager.py)
  const s4 = pptx.addSlide();
  addSlideHeader(
    s4,
    '04. Risk Math (db_manager.py)',
    'Projecting Drift Vectors to Infrastructure Collision T-min',
    4
  );
  const leftItems = [
    [
      'Metric UTM Projection & IDW',
      'SQLite + GeoPandas loads monitored Saudi POIs and projects coordinates to UTM Zone 38N (EPSG:32638) for inverse-distance-weighted velocity interpolation.',
    ],
    [
      'Wind Forcing Adjustment',
      'Combines baseline SAR dune kinematics with dominant wind forcing to calculate effective drift rate, transport bearing, and Wind Influence factor.',
    ],
    [
      'Closest Approach & Probability',
      'Solves forward ray-to-perimeter intersection distance to compute Estimated T-min, Collision Probability %, and High / Med / Low tiers.',
    ],
  ];
  leftItems.forEach(([heading, desc], idx) => {
    const y = 1.75 + idx * 1.65;
    s4.addText(heading, {
      x: 0.7,
      y,
      w: 5.8,
      h: 0.35,
      fontFace: 'Calibri',
      fontSize: 15,
      bold: true,
      color: COLORS.ink,
    });
    s4.addText(desc, {
      x: 0.7,
      y: y + 0.36,
      w: 5.8,
      h: 1.05,
      fontFace: 'Calibri',
      fontSize: 12.5,
      color: COLORS.muted,
      valign: 'top',
    });
  });

  s4.addShape('roundRect', {
    x: 6.85,
    y: 1.75,
    w: 5.78,
    h: 4.8,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08,
  });
  s4.addText(`Live High-Risk Watchlist (${highPois.length} of ${pois.length} POIs)`, {
    x: 7.15,
    y: 2.0,
    w: 5.2,
    h: 0.35,
    fontFace: 'Calibri',
    fontSize: 14,
    bold: true,
    color: COLORS.ink,
  });
  pois.slice(0, 4).forEach((poi, idx) => {
    const y = 2.55 + idx * 0.96;
    s4.addText(poi.name, {
      x: 7.15,
      y,
      w: 3.45,
      h: 0.3,
      fontFace: 'Calibri',
      fontSize: 12,
      bold: true,
      color: COLORS.ink,
    });
    s4.addText(formatCoordinates(poi.lat, poi.lon), {
      x: 7.15,
      y: y + 0.3,
      w: 3.45,
      h: 0.25,
      fontFace: 'Consolas',
      fontSize: 10.5,
      color: COLORS.subtle,
    });
    s4.addText(`${poi.collision_risk} (${poi.collision_probability_pct}%)`, {
      x: 10.65,
      y,
      w: 1.72,
      h: 0.3,
      align: 'right',
      fontFace: 'Calibri',
      fontSize: 11.5,
      bold: true,
      color:
        poi.collision_risk === 'High'
          ? COLORS.rose
          : poi.collision_risk === 'Med'
          ? COLORS.amber
          : COLORS.emerald,
    });
    s4.addText(`T-min ${formatTMin(poi.t_min_years, poi.t_min_months)}`, {
      x: 10.25,
      y: y + 0.3,
      w: 2.12,
      h: 0.25,
      align: 'right',
      fontFace: 'Consolas',
      fontSize: 10.5,
      color: COLORS.muted,
    });
  });

  // Slide 5: Interactive Frontend Demo
  const s5 = pptx.addSlide();
  addSlideHeader(
    s5,
    '05. Interactive Frontend',
    'Live Demo: Saudi Arabia Map Console (react-leaflet)',
    5
  );
  const s5Cols = [
    [
      '1. GeoJSON Country Mask',
      'Centered on Saudi Arabia (24.1°N, 45.2°E) with an inverted world-minus-KSA GeoJSON polygon greying out surrounding countries.',
    ],
    [
      '2. Vectors & Heatmap',
      `Toggle instantaneously between ${vectors.length} directional velocity arrows, a continuous HTML5 Canvas thermal velocity plume, or both combined.`,
    ],
    [
      '3. 6-Field POI Tooltip',
      'Clicking any POI marker displays Name, Exact Coordinates, 1-sentence summary, Collision Risk (High/Med/Low), Estimated T-min, and Wind Influence factor.',
    ],
  ];
  s5Cols.forEach(([heading, body], idx) => {
    const x = 0.7 + idx * 4.05;
    s5.addShape('roundRect', {
      x,
      y: 1.9,
      w: 3.82,
      h: 4.3,
      fill: { color: COLORS.white },
      line: { color: COLORS.border, width: 1 },
      rectRadius: 0.08,
    });
    s5.addText(heading, {
      x: x + 0.28,
      y: 2.2,
      w: 3.26,
      h: 0.4,
      fontFace: 'Calibri',
      fontSize: 16,
      bold: true,
      color: COLORS.ink,
    });
    s5.addText(body, {
      x: x + 0.28,
      y: 2.78,
      w: 3.26,
      h: 3.0,
      fontFace: 'Calibri',
      fontSize: 14,
      color: COLORS.muted,
      valign: 'top',
      lineSpacingMultiple: 1.28,
    });
  });

  // Slide 6: FastAPI & Risk Matrix
  const s6 = pptx.addSlide();
  addSlideHeader(
    s6,
    '06. FastAPI & Risk Matrix',
    'Lightweight CORS Backend & Multi-Asset Triage',
    6
  );
  s6.addShape('roundRect', {
    x: 0.7,
    y: 1.9,
    w: 5.8,
    h: 4.3,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08,
  });
  s6.addText('FastAPI Endpoints (backend/main.py)', {
    x: 1.0,
    y: 2.2,
    w: 5.2,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 16,
    bold: true,
    color: COLORS.ink,
  });
  s6.addText(
    'GET  /api/health          Engine & vector count status\n' +
      'GET  /api/drift-vectors   SAR velocity field JSON\n' +
      'GET  /api/pois            Wind-adjusted POI risk rankings\n' +
      'POST /api/simulate        Live wind speed & bearing forecast',
    {
      x: 1.0,
      y: 2.85,
      w: 5.2,
      h: 2.6,
      fontFace: 'Consolas',
      fontSize: 11.5,
      color: COLORS.muted,
      lineSpacingMultiple: 1.6,
    }
  );

  s6.addShape('roundRect', {
    x: 6.83,
    y: 1.9,
    w: 5.8,
    h: 4.3,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08,
  });
  s6.addText('Operational Risk Matrix & Export', {
    x: 7.13,
    y: 2.2,
    w: 5.2,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 16,
    bold: true,
    color: COLORS.ink,
  });
  s6.addText(
    `• Tabular triage across all ${pois.length} monitored Saudi assets (hydrocarbon hubs, rail, highways, desalination mains, solar plants).\n\n` +
      '• Real-time search, risk tier filtering, and one-click map locating.\n\n' +
      '• Instant CSV export for field engineering dispatch.',
    {
      x: 7.13,
      y: 2.8,
      w: 5.2,
      h: 3.1,
      fontFace: 'Calibri',
      fontSize: 13.5,
      color: COLORS.muted,
      lineSpacingMultiple: 1.25,
    }
  );

  // Slide 7: Verification & Roadmap
  const s7 = pptx.addSlide();
  addSlideHeader(
    s7,
    '07. Verification & Roadmap',
    'Verified Prototype, Ready for Continuous SAR Operations',
    7
  );
  s7.addShape('roundRect', {
    x: 0.7,
    y: 1.9,
    w: 5.8,
    h: 4.3,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08,
  });
  s7.addText('Engineering Verification', {
    x: 1.0,
    y: 2.2,
    w: 5.2,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 16,
    bold: true,
    color: COLORS.ink,
  });
  s7.addText(
    '• Core risk math unit-tested (node:test, 5/5 assertions passing).\n\n' +
      '• Python 3.14 backend syntax & TypeScript Vite build verified cleanly.\n\n' +
      '• Headless Chromium verified at desktop (1440×900) and mobile (390×844) with zero console errors.',
    {
      x: 1.0,
      y: 2.8,
      w: 5.2,
      h: 3.0,
      fontFace: 'Calibri',
      fontSize: 13.5,
      color: COLORS.muted,
      lineSpacingMultiple: 1.25,
    }
  );

  s7.addShape('roundRect', {
    x: 6.83,
    y: 1.9,
    w: 5.8,
    h: 4.3,
    fill: { color: COLORS.white },
    line: { color: COLORS.border, width: 1 },
    rectRadius: 0.08,
  });
  s7.addText('Post-Hackathon Roadmap', {
    x: 7.13,
    y: 2.2,
    w: 5.2,
    h: 0.4,
    fontFace: 'Calibri',
    fontSize: 16,
    bold: true,
    color: COLORS.ink,
  });
  s7.addText(
    '1. Automate 12-day repeat-pass NISAR L2 GSLC ingestion with EARTHDATA_TOKEN.\n\n' +
      '2. Assimilate ERA5 hourly wind vectors for seasonal Shamal sandstorm modeling.\n\n' +
      '3. Trigger automated perimeter alerts when any asset drops below T-min < 12 months.',
    {
      x: 7.13,
      y: 2.8,
      w: 5.2,
      h: 3.0,
      fontFace: 'Calibri',
      fontSize: 13.5,
      color: COLORS.muted,
      lineSpacingMultiple: 1.25,
    }
  );

  return pptx;
}

export async function downloadPresentationPptx(
  pois: PoiRisk[],
  vectors: DriftVector[]
): Promise<void> {
  const pptx = buildPresentationPptx(pois, vectors);
  await pptx.writeFile({ fileName: 'DuneMarch_Demo.pptx' });
}
