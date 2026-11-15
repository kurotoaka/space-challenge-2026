# DuneMarch — Saudi Arabia Sand Dune Migration & Infrastructure Risk Console

DuneMarch is a geospatial platform designed to track sand dune migration across Saudi Arabia and assess threat vectors to critical infrastructure. The system ingests NASA NISAR satellite data to compute the velocity and directional vectors of aeolian drift. By projecting these trajectories against a spatial database of transportation networks, municipalities, and industrial facilities, the engine calculates collision probabilities and estimated time of impact, factoring in dominant meteorological wind patterns. The architecture utilizes an AWS-hosted Python backend optimized for large-scale geospatial processing to deliver analytics to a React frontend. The resulting interface provides an interactive map allowing users to select specific assets and visualize their precise risk profiles and collision timelines.

---

## Key Capabilities

- **Zero-Download NASA NISAR Cloud Streaming**: Queries NASA Earthdata CMR (`NISAR_L2_GSLC_V1`, `NISAR_L2_GSLC_PROVISIONAL_V1`, and `NISAR_L2_GSLC_BETA_V1`) via `earthaccess` + `xarray`/`h5netcdf` and streams spatial subsets directly in memory without filling local volumes.
- **Gap-Normalized 2D FFT Cross-Correlation**: Runs Hann-windowed Radix-2 `rfft2`/`irfft2` matching with Guizar-Sicairos sub-pixel DFT peak refinement on an 8-worker Dask `LocalCluster`. Normalizes displacement by exact pair interval $\Delta t$, cleanly bridging the **Jul 27 – Aug 10, 2026** NISAR outage gap (`15d Δt`) through the **Validated V1** release (`Nov 14, 2026`).
- **UTM 38N Infrastructure Collision Math (`T-min`)**: Uses SQLite + GeoPandas + `pyproj` (`EPSG:32638`) to solve ray-to-perimeter closest approach and Perimeter Breach ETA across **20 monitored Saudi POIs** (energy hubs, freight rail, desalination mains, solar/wind arrays, and UNESCO heritage sites).
- **High-Detail Border & Sand Sea Cartography**: Accurate 372-vertex Saudi Arabia GeoBoundaries ADM0 border mask with detailed Natural Earth contours for **Rub' al Khali**, **Al-Jafurah**, **Ad-Dahna**, and **An-Nafud**.
- **Interactive Front-End Console**:
  - High-DPI Canvas heatmap, directional velocity arrows, and sweep-SAR swath layers with spatial hashing for smooth zoom performance.
  - Real-time **Wind Forcing** panel (`speed_kt`, `bearing_deg`, `horizon_years`) docked on the map stage.
  - On-the-go **Before / After 2D FFT Radar Comparator** on any POI or custom coordinate clicked inside a Saudi Erg.
  - Interactive **Live Demo Deck** (with `.pptx` export), searchable **Risk Matrix** with CSV export, and **EC2 Setup Guide**.

---

## Architecture

```text
├── src/                        # React 19 + TypeScript + Tailwind v4 + Leaflet frontend
│   ├── components/             # DuneMapStage, Canvas layers, TimeScrubberBar, BeforeAfterModal, PresentationView, RiskMatrixView
│   ├── data/                   # GeoBoundaries KSA border, Natural Earth Ergs, 30 NISAR epochs
│   └── utils/                  # UTM/tangent-plane riskEngine, Radix-2 2D FFT spotCorrelation, .pptx export
├── backend/                    # FastAPI + Python 3.14 geospatial processing service
│   ├── engine.py               # earthaccess CMR queries + xarray/Dask streaming 2D FFT engine
│   ├── db_manager.py           # SQLite + GeoPandas spatial POI store & EPSG:32638 T-min math
│   └── main.py                 # CORS API (/api/health, /api/token-status, /api/drift-vectors, /api/pois, /api/simulate)
├── start.sh                    # Dual-server EC2 launcher (Uvicorn :8000 + Vite :3000)
└── scripts/                    # Remote sync helpers
```

---

## Quick Start (Local / AWS EC2)

### Prerequisites
- **Node.js 20+** and `npm`
- **Python 3.11+** (tested on Python 3.14 on Ubuntu / EC2 `t3.2xlarge`)
- Optional: NASA Earthdata Bearer Token (`EARTHDATA_TOKEN`) for live `NISAR_L2_GSLC_*` granule discovery

### 1. Environment Setup

```bash
cp .env.example .env
# Optionally add EARTHDATA_TOKEN=<your_nasa_earthdata_token> inside .env
```

### 2. Install Frontend & Python Dependencies

```bash
npm install
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 3. Launch Both Servers (`:8000` FastAPI + `:3000` React)

```bash
chmod +x start.sh
./start.sh
```

Access the UI at **`http://localhost:3000`** (or via SSH port forwarding `ssh -L 3000:localhost:3000 -L 8000:localhost:8000 ubuntu@<EC2_IP>`).

---

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service health check, active data source, and vector count |
| `GET` | `/api/token-status` | NASA Earthdata auth status & matched `NISAR_L2_GSLC_V1 / PROVISIONAL_V1 / BETA_V1` granule counts |
| `GET` | `/api/drift-vectors` | SAR-derived dune velocity vector field JSON |
| `GET` | `/api/pois` | All 20 Saudi infrastructure POIs ranked by Breach ETA (`T-min`) |
| `POST` | `/api/simulate` | Recomputes vector trajectories & POI collision probabilities under custom Shamal wind forcing |

---

## Testing & Verification

```bash
# Run pure physics, 2D FFT sub-pixel & border tests
npx --yes tsx --test src/utils/riskEngine.test.ts

# TypeScript + Vite production build & ESLint
npm run build
npm run lint

# Python syntax validation
python3 -m py_compile backend/engine.py backend/db_manager.py backend/main.py
```

---

## Data Sources & Acknowledgments

- **NASA Data**: [NASA-ISRO SAR (NISAR) Level-2 GSLC](https://search.earthdata.nasa.gov/search/granules?p=C3622244601-ASF) (`NISAR_L2_GSLC_V1`, `NISAR_L2_GSLC_PROVISIONAL_V1`, `NISAR_L2_GSLC_BETA_V1`) via ASF DAAC & `earthaccess`
- **Space Agency Partner & Atmospheric Forcing**: [Copernicus / ESA ERA5 Reanalysis](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) 10 m wind fields & [Saudi Space Agency](https://ssa.gov.sa/) national geomatics context
- **Cartographic & Boundary Layers**: [GeoBoundaries ADM0](https://www.geoboundaries.org/), [Natural Earth 10m Physical Regions](https://www.naturalearthdata.com/), and Esri World Imagery
