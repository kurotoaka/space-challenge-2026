import { Fragment } from 'react';
import { Polyline, Tooltip } from 'react-leaflet';
import type { DriftVector } from '../types/geospatial';

interface DriftVectorsLayerProps {
  vectors: DriftVector[];
  visible: boolean;
}

function getVelocityColor(speed: number): string {
  if (speed >= 20) return '#dc2626';
  if (speed >= 14) return '#d97706';
  return '#0284c7';
}

export function DriftVectorsLayer({ vectors, visible }: DriftVectorsLayerProps) {
  if (!visible) {
    return null;
  }

  return (
    <>
      {vectors.map((vec) => {
        const color = getVelocityColor(vec.speed_m_yr);
        const degLength = Math.max(0.18, Math.min(0.56, vec.speed_m_yr * 0.02));
        const rad = (vec.azimuth_deg * Math.PI) / 180;
        const cosLat = Math.max(0.4, Math.cos((vec.lat * Math.PI) / 180));

        const endLat = vec.lat + degLength * Math.cos(rad);
        const endLon = vec.lon + (degLength * Math.sin(rad)) / cosLat;

        // Chevron arrowhead wings (+/- 148 deg back from travel azimuth)
        const wingLen = Math.max(0.08, degLength * 0.28);
        const leftWingRad = ((vec.azimuth_deg + 148) * Math.PI) / 180;
        const rightWingRad = ((vec.azimuth_deg - 148) * Math.PI) / 180;

        const leftLat = endLat + wingLen * Math.cos(leftWingRad);
        const leftLon = endLon + (wingLen * Math.sin(leftWingRad)) / cosLat;
        const rightLat = endLat + wingLen * Math.cos(rightWingRad);
        const rightLon = endLon + (wingLen * Math.sin(rightWingRad)) / cosLat;

        return (
          <Fragment key={vec.id}>
            <Polyline
              positions={[
                [vec.lat, vec.lon],
                [endLat, endLon],
              ]}
              pathOptions={{
                color,
                weight: 2.2,
                opacity: 0.9,
              }}
            >
              <Tooltip direction="top" sticky>
                <div className="font-sans font-semibold text-xs text-slate-900">{vec.erg_zone}</div>
                <div className="font-mono text-[11px] tabular-nums text-slate-700">
                  {vec.speed_m_yr.toFixed(1)} m/yr · {vec.azimuth_deg.toFixed(0)}°
                </div>
                <div className="font-mono text-[11px] tabular-nums text-slate-500">
                  u={vec.u_m_yr.toFixed(1)}, v={vec.v_m_yr.toFixed(1)} m/yr · SNR {vec.snr.toFixed(1)}
                </div>
              </Tooltip>
            </Polyline>
            <Polyline
              positions={[
                [leftLat, leftLon],
                [endLat, endLon],
                [rightLat, rightLon],
              ]}
              interactive={false}
              pathOptions={{
                color,
                weight: 2.2,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Fragment>
        );
      })}
    </>
  );
}
