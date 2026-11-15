"""
db_manager.py — SQLite3 + GeoPandas Spatial POI Manager & Dune Collision Risk Engine
Computes wind-adjusted forward trajectory intersections, Time to Collision (T-min),
collision probability percentage, and Risk Tier (High / Med / Low) for Saudi infrastructure POIs.
"""

from __future__ import annotations

import math
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import geopandas as gpd
from pyproj import Transformer
from shapely.geometry import Point

DB_PATH = Path(__file__).resolve().parent / "dune_risk.db"

# WGS84 geographic <-> UTM Zone 38N metric projection (covers central/eastern KSA in meters)
_TO_METRIC = Transformer.from_crs("EPSG:4326", "EPSG:32638", always_xy=True)


@dataclass(frozen=True, slots=True)
class WindForcing:
    speed_kt: float = 18.0         # Dominant Shamal / Trade wind speed in knots
    azimuth_deg: float = 145.0     # Direction wind blows TOWARDS (degrees clockwise from North)
    horizon_years: float = 10.0    # Forward projection window


SEED_POIS: list[dict[str, Any]] = [
    {
        "id": "poi-shaybah",
        "name": "Shaybah Central Processing Facility",
        "category": "Energy Infrastructure",
        "region": "Rub' al Khali",
        "lat": 22.5167,
        "lon": 53.9983,
        "buffer_m": 650.0,
        "upwind_dune_dist_m": 215.0,
        "upwind_bearing_deg": 28.0,
        "summary": "Critical hydrocarbon processing hub encircled by 150m star and barchan dunes migrating southward.",
    },
    {
        "id": "poi-haradh",
        "name": "Haradh Gas Plant & Spur Line",
        "category": "Energy Infrastructure",
        "region": "Al-Jafurah / Ghawar",
        "lat": 24.1442,
        "lon": 49.0644,
        "buffer_m": 550.0,
        "upwind_dune_dist_m": 190.0,
        "upwind_bearing_deg": 338.0,
        "summary": "High-throughput gas processing terminal facing rapid southeastward barchan encroachment from Al-Jafurah.",
    },
    {
        "id": "poi-hofuf-rail",
        "name": "Al-Hofuf Freight Rail Corridor Km 148",
        "category": "Transport & Rail",
        "region": "Al-Ahsa / Al-Jafurah",
        "lat": 25.3833,
        "lon": 49.6850,
        "buffer_m": 400.0,
        "upwind_dune_dist_m": 165.0,
        "upwind_bearing_deg": 335.0,
        "summary": "Primary east-west rail freight artery experiencing active sand-sheet burial along unprotected embankments.",
    },
    {
        "id": "poi-hwy10-empty",
        "name": "Highway 10 — Batha Solar Corridor",
        "category": "Transport & Rail",
        "region": "Rub' al Khali",
        "lat": 21.8420,
        "lon": 51.9640,
        "buffer_m": 450.0,
        "upwind_dune_dist_m": 410.0,
        "upwind_bearing_deg": 35.0,
        "summary": "Straight-line desert freight highway intersecting high-mobility transverse dune trains near the UAE border.",
    },
    {
        "id": "poi-riyadh-dammam",
        "name": "Riyadh–Dammam Rail Sector 214",
        "category": "Transport & Rail",
        "region": "Ad-Dahna",
        "lat": 25.2410,
        "lon": 47.6280,
        "buffer_m": 420.0,
        "upwind_dune_dist_m": 470.0,
        "upwind_bearing_deg": 342.0,
        "summary": "Passenger and cargo rail crossing Ad-Dahna reddish linear dune ridges with seasonal Shamal drift surges.",
    },
    {
        "id": "poi-jubail-pipe",
        "name": "Jubail–Riyadh Desalination Corridor",
        "category": "Water & Utilities",
        "region": "Al-Jafurah",
        "lat": 25.9150,
        "lon": 49.1820,
        "buffer_m": 480.0,
        "upwind_dune_dist_m": 495.0,
        "upwind_bearing_deg": 332.0,
        "summary": "Twin potable water transmission mains exposed to mobile coastal-margin barchan horns south of Jubail.",
    },
    {
        "id": "poi-sakaka-solar",
        "name": "Sakaka Utility Solar Array",
        "category": "Renewable Energy",
        "region": "An-Nafud",
        "lat": 29.7420,
        "lon": 40.0680,
        "buffer_m": 700.0,
        "upwind_dune_dist_m": 760.0,
        "upwind_bearing_deg": 296.0,
        "summary": "300 MW photovoltaic plant bordering northern An-Nafud sand sheets requiring regular perimeter trenching.",
    },
    {
        "id": "poi-alula-heritage",
        "name": "Al-Ula Southern Conservation Buffer",
        "category": "Heritage & Urban",
        "region": "Western An-Nafud",
        "lat": 26.6170,
        "lon": 37.9230,
        "buffer_m": 600.0,
        "upwind_dune_dist_m": 820.0,
        "upwind_bearing_deg": 295.0,
        "summary": "Sandstone heritage valley protected by canyon windbreaks with low, localized aeolian sand accumulation.",
    },
    {
        "id": "poi-sulayyil-grid",
        "name": "As-Sulayyil 380kV Substation",
        "category": "Water & Utilities",
        "region": "Western Rub' al Khali",
        "lat": 20.4610,
        "lon": 45.5740,
        "buffer_m": 500.0,
        "upwind_dune_dist_m": 420.0,
        "upwind_bearing_deg": 35.0,
        "summary": "High-voltage grid relay station flanking western Empty Quarter sand tongues during winter dust events.",
    },
    {
        "id": "poi-khurais-field",
        "name": "Khurais Injection Manifold East",
        "category": "Energy Infrastructure",
        "region": "Ad-Dahna",
        "lat": 25.0720,
        "lon": 48.0410,
        "buffer_m": 520.0,
        "upwind_dune_dist_m": 255.0,
        "upwind_bearing_deg": 344.0,
        "summary": "Oilfield water-injection corridor situated immediately leeward of active Ad-Dahna longitudinal dunes.",
    },
]


def init_db(db_path: Path = DB_PATH) -> None:
    """Initialize SQLite spatial POI table and seed Saudi Arabian POIs idempotently."""
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pois (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                region TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                buffer_m REAL NOT NULL,
                upwind_dune_dist_m REAL NOT NULL,
                upwind_bearing_deg REAL NOT NULL,
                summary TEXT NOT NULL,
                wkt_geom TEXT NOT NULL
            )
            """
        )
        for poi in SEED_POIS:
            wkt = Point(poi["lon"], poi["lat"]).wkt
            conn.execute(
                """
                INSERT OR REPLACE INTO pois (
                    id, name, category, region, lat, lon, buffer_m,
                    upwind_dune_dist_m, upwind_bearing_deg, summary, wkt_geom
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    poi["id"],
                    poi["name"],
                    poi["category"],
                    poi["region"],
                    poi["lat"],
                    poi["lon"],
                    poi["buffer_m"],
                    poi["upwind_dune_dist_m"],
                    poi["upwind_bearing_deg"],
                    poi["summary"],
                    wkt,
                ),
            )
        conn.commit()


def load_pois_gdf(db_path: Path = DB_PATH) -> gpd.GeoDataFrame:
    """Load POIs from SQLite into a GeoPandas GeoDataFrame (EPSG:4326)."""
    if not db_path.exists():
        init_db(db_path)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = [dict(r) for r in conn.execute("SELECT * FROM pois").fetchall()]

    geometry = [Point(r["lon"], r["lat"]) for r in rows]
    return gpd.GeoDataFrame(rows, geometry=geometry, crs="EPSG:4326")


def evaluate_poi_risks(
    drift_vectors: list[dict[str, Any]],
    wind: WindForcing = WindForcing(),
    db_path: Path = DB_PATH,
) -> list[dict[str, Any]]:
    """
    Project SAR-derived dune drift velocity vectors forward for each POI using metric UTM math,
    adjusting for dominant wind forcing. Returns T-min, collision probability %, risk tier, and
    wind influence factor.
    """
    gdf_pois = load_pois_gdf(db_path)

    # Pre-project drift vector positions into metric UTM (meters) for IDW interpolation
    vec_pts = []
    for vec in drift_vectors:
        vx, vy = _TO_METRIC.transform(vec["lon"], vec["lat"])
        vec_pts.append((vx, vy, vec["u_m_yr"], vec["v_m_yr"], vec["snr"]))

    # Dominant wind transport perturbation relative to 15-kt climatological Shamal baseline
    wind_rad = math.radians(wind.azimuth_deg)
    wind_delta_m_yr = (wind.speed_kt - 15.0) * 0.42
    wind_u = wind_delta_m_yr * math.sin(wind_rad)
    wind_v = wind_delta_m_yr * math.cos(wind_rad)

    assessed: list[dict[str, Any]] = []

    for _, row in gdf_pois.iterrows():
        px, py = _TO_METRIC.transform(float(row["lon"]), float(row["lat"]))

        # Inverse-Distance-Weighted (IDW) local drift vector around the POI
        weights_sum = 0.0
        u_sar = 0.0
        v_sar = 0.0
        snr_acc = 0.0
        for vx, vy, vu, vv, snr in vec_pts:
            dist_km = max(math.hypot(px - vx, py - vy) / 1000.0, 5.0)
            w = 1.0 / (dist_km ** 2)
            weights_sum += w
            u_sar += w * vu
            v_sar += w * vv
            snr_acc += w * snr

        if weights_sum > 0:
            u_sar /= weights_sum
            v_sar /= weights_sum
            local_snr = snr_acc / weights_sum
        else:
            u_sar, v_sar, local_snr = 0.0, -10.0, 8.0

        # Combine SAR displacement with dominant wind forcing
        u_eff = u_sar + wind_u
        v_eff = v_sar + wind_v

        eff_speed = math.hypot(u_eff, v_eff)
        eff_az = (math.degrees(math.atan2(u_eff, v_eff)) + 360.0) % 360.0

        # Upwind dune crest positioned along `upwind_bearing_deg` from the POI
        up_rad = math.radians(float(row["upwind_bearing_deg"]))
        dune_x0 = float(row["upwind_dune_dist_m"]) * math.sin(up_rad)
        dune_y0 = float(row["upwind_dune_dist_m"]) * math.cos(up_rad)

        # Ray-closest-approach in meters: dune(t) = (dune_x0 + u_eff*t, dune_y0 + v_eff*t)
        # Solve d/dt ||dune(t)||^2 = 0 => t_closest = -(p . v) / ||v||^2
        v_sq = u_eff * u_eff + v_eff * v_eff
        if v_sq > 1e-6:
            t_closest_yr = -(dune_x0 * u_eff + dune_y0 * v_eff) / v_sq
        else:
            t_closest_yr = 99.0

        t_clamped = max(0.0, min(t_closest_yr, wind.horizon_years * 3.0))
        dx_min = dune_x0 + u_eff * t_clamped
        dy_min = dune_y0 + v_eff * t_clamped
        d_min_m = math.hypot(dx_min, dy_min)

        # Time to reach perimeter buffer or closest approach if trajectory aims inside buffer
        buffer_m = float(row["buffer_m"])
        approaching = t_closest_yr > 0.0 and d_min_m <= buffer_m
        if approaching and eff_speed > 0.2:
            # First entry into POI perimeter radius
            dist_to_edge = max(12.0, float(row["upwind_dune_dist_m"]) - buffer_m * 0.35)
            t_min_years = dist_to_edge / eff_speed
        elif t_closest_yr > 0.0 and eff_speed > 0.2:
            t_min_years = t_closest_yr
        else:
            t_min_years = 45.0

        # Wind influence factor: ratio of wind-adjusted speed to raw SAR speed
        sar_speed = max(math.hypot(u_sar, v_sar), 0.1)
        wind_influence = round(eff_speed / sar_speed, 2)

        # Collision probability combines trajectory intersection proximity, T-min urgency & SNR
        clearance_ratio = d_min_m / max(buffer_m, 100.0)
        proximity_score = math.exp(-0.9 * (clearance_ratio ** 1.6))
        time_urgency = math.exp(-0.08 * max(0.0, t_min_years - 1.0)) if t_closest_yr > 0 else 0.08
        raw_prob = 100.0 * (0.62 * proximity_score + 0.38 * time_urgency) * min(1.0, 0.75 + local_snr / 40.0)
        collision_prob = round(float(max(4.0, min(97.5, raw_prob))), 1)

        if collision_prob >= 68.0 or (t_min_years <= 8.0 and clearance_ratio < 0.85):
            risk_level = "High"
        elif collision_prob >= 36.0 or t_min_years <= 16.0:
            risk_level = "Med"
        else:
            risk_level = "Low"

        t_min_months = round(t_min_years * 12.0, 1)

        assessed.append(
            {
                "id": row["id"],
                "name": row["name"],
                "category": row["category"],
                "region": row["region"],
                "lat": round(float(row["lat"]), 5),
                "lon": round(float(row["lon"]), 5),
                "summary": row["summary"],
                "collision_risk": risk_level,
                "collision_probability_pct": collision_prob,
                "t_min_years": round(t_min_years, 2),
                "t_min_months": t_min_months,
                "wind_influence": wind_influence,
                "effective_drift_m_yr": round(eff_speed, 2),
                "effective_azimuth_deg": round(eff_az, 1),
                "closest_approach_m": round(d_min_m, 1),
                "buffer_m": buffer_m,
            }
        )

    assessed.sort(key=lambda item: (item["t_min_years"], -item["collision_probability_pct"]))
    return assessed


if __name__ == "__main__":
    from engine import fetch_nisar_ksa_vectors, vectors_to_dicts

    init_db()
    vecs = vectors_to_dicts(fetch_nisar_ksa_vectors())
    pois = evaluate_poi_risks(vecs)
    for p in pois[:3]:
        print(f"{p['name']}: Risk={p['collision_risk']} ({p['collision_probability_pct']}%), T-min={p['t_min_years']} yrs")
