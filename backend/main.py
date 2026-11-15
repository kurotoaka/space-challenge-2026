"""
main.py — Lightweight FastAPI Backend for Dune Drift Tracking & Risk Assessment
Python 3.14 | Serves SAR dune drift velocity vectors and wind-adjusted POI risk endpoints.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db_manager import WindForcing, evaluate_poi_risks, init_db
from engine import fetch_nisar_ksa_vectors, vectors_to_dicts


class SimulationRequest(BaseModel):
    wind_speed_kt: float = Field(default=18.0, ge=0.0, le=60.0)
    wind_azimuth_deg: float = Field(default=145.0, ge=0.0, le=360.0)
    horizon_years: float = Field(default=10.0, ge=1.0, le=30.0)


_STATE: dict[str, Any] = {"vectors": []}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    _STATE["vectors"] = vectors_to_dicts(fetch_nisar_ksa_vectors())
    yield


app = FastAPI(
    title="DuneMarch Dune Drift API",
    version="1.0.0",
    description="NISAR L2 GSLC dune drift velocity vectors and Saudi infrastructure sand encroachment telemetry.",
    lifespan=lifespan,
)

# Allow React dev server (localhost:3000) & deployed AI Studio origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    token_present = bool(os.getenv("EARTHDATA_TOKEN", "").strip())
    sources = {v.get("source", "calibrated_sar_model") for v in _STATE["vectors"]}
    active_source = "nisar_gslc_fft" if "nisar_gslc_fft" in sources else "calibrated_sar_model"
    return {
        "status": "ok",
        "vector_count": len(_STATE["vectors"]),
        "engine": "dask-fft-gslc",
        "earthdata_token_configured": token_present,
        "active_data_source": active_source,
    }


@app.get("/api/token-status")
def token_status() -> dict[str, Any]:
    token = os.getenv("EARTHDATA_TOKEN", "").strip()
    if not token:
        return {
            "token_present": False,
            "earthdata_authenticated": False,
            "nisar_granules_found": 0,
            "active_source": "calibrated_sar_model",
            "detail": "EARTHDATA_TOKEN environment variable is not set on this host.",
        }

    try:
        import earthaccess

        auth = earthaccess.login(strategy="environment")
        if not auth.authenticated:
            return {
                "token_present": True,
                "earthdata_authenticated": False,
                "nisar_granules_found": 0,
                "active_source": "calibrated_sar_model",
                "detail": "EARTHDATA_TOKEN is present, but NASA Earthdata login rejected it (expired or invalid).",
            }
        v1 = earthaccess.search_data(
            short_name="NISAR_L2_GSLC_V1",
            bounding_box=(34.50, 16.30, 55.70, 32.20),
            count=2,
        )
        prov = earthaccess.search_data(
            short_name="NISAR_L2_GSLC_PROVISIONAL_V1",
            bounding_box=(34.50, 16.30, 55.70, 32.20),
            count=2,
        )
        beta = earthaccess.search_data(
            short_name="NISAR_L2_GSLC_BETA_V1",
            bounding_box=(34.50, 16.30, 55.70, 32.20),
            count=2,
        )
        total_sample = len(v1) + len(prov) + len(beta)
        return {
            "token_present": True,
            "earthdata_authenticated": True,
            "nisar_granules_found": total_sample,
            "collections": {
                "NISAR_L2_GSLC_V1": len(v1),
                "NISAR_L2_GSLC_PROVISIONAL_V1": len(prov),
                "NISAR_L2_GSLC_BETA_V1": len(beta),
            },
            "active_source": (
                "nisar_gslc_fft" if any(v.get("source") == "nisar_gslc_fft" for v in _STATE["vectors"]) else "calibrated_sar_model"
            ),
            "detail": (
                f"Authenticated with NASA Earthdata; matched NISAR_L2_GSLC_V1 ({len(v1)}+), "
                f"PROVISIONAL_V1 ({len(prov)}+), BETA_V1 ({len(beta)}+) granules over KSA."
                if total_sample > 0
                else "Authenticated with NASA Earthdata, but 0 NISAR L2 GSLC granules matched KSA bounds."
            ),
        }
    except Exception as exc:
        return {
            "token_present": True,
            "earthdata_authenticated": False,
            "nisar_granules_found": 0,
            "active_source": "calibrated_sar_model",
            "detail": f"Token check error: {exc}",
        }


@app.get("/api/drift-vectors")
def get_drift_vectors(
    wind_speed_kt: float = Query(default=18.0, ge=0.0, le=60.0),
    wind_azimuth_deg: float = Query(default=145.0, ge=0.0, le=360.0),
) -> dict[str, Any]:
    vectors = _STATE["vectors"]
    return {
        "count": len(vectors),
        "wind": {"speed_kt": wind_speed_kt, "azimuth_deg": wind_azimuth_deg},
        "vectors": vectors,
    }


@app.get("/api/pois")
def get_pois(
    wind_speed_kt: float = Query(default=18.0, ge=0.0, le=60.0),
    wind_azimuth_deg: float = Query(default=145.0, ge=0.0, le=360.0),
    horizon_years: float = Query(default=10.0, ge=1.0, le=30.0),
) -> dict[str, Any]:
    wind = WindForcing(
        speed_kt=wind_speed_kt,
        azimuth_deg=wind_azimuth_deg,
        horizon_years=horizon_years,
    )
    pois = evaluate_poi_risks(_STATE["vectors"], wind=wind)
    return {"count": len(pois), "wind": wind.__dict__, "pois": pois}


@app.post("/api/simulate")
def simulate_risk(payload: SimulationRequest) -> dict[str, Any]:
    wind = WindForcing(
        speed_kt=payload.wind_speed_kt,
        azimuth_deg=payload.wind_azimuth_deg,
        horizon_years=payload.horizon_years,
    )
    pois = evaluate_poi_risks(_STATE["vectors"], wind=wind)
    return {
        "vectors": _STATE["vectors"],
        "pois": pois,
        "wind": payload.model_dump(),
    }


@app.post("/api/pipeline/refresh")
def refresh_pipeline() -> dict[str, Any]:
    _STATE["vectors"] = vectors_to_dicts(fetch_nisar_ksa_vectors())
    return {"refreshed": True, "vector_count": len(_STATE["vectors"])}
