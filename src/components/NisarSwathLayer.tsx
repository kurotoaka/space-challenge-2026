import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { ERG_REGIONS } from '../data/ergRegions';
import type { BaseMapStyle, ErgZoneName, ObservationEpoch } from '../types/geospatial';

interface NisarSwathLayerProps {
  visible: boolean;
  baseMap: BaseMapStyle;
  epoch: ObservationEpoch;
  selectedErg: 'All' | ErgZoneName;
}

// Stationary 240 km NISAR SweepSAR orbital corridors covering Saudi Arabia over a 12-day repeat cycle
const SWATH_LONGITUDES = [39.6, 44.0, 48.4, 52.8];

/**
 * Renders stationary 12-day repeat-orbit NISAR SweepSAR corridors (highlighting the active pass)
 * plus geo-anchored L-band SAR dune-crest backscatter ridges tied to true Earth coordinates
 * so lines stay locked to the desert dunes instead of swimming when changing dates or panning.
 */
export function NisarSwathLayer({ visible, baseMap, epoch, selectedErg }: NisarSwathLayerProps) {
  const map = useMap();
  const renderSarTexture = baseMap === 'sar';

  useEffect(() => {
    if (!visible && !renderSarTexture) return;

    const SwathOverlay = L.Layer.extend({
      onAdd(targetMap: L.Map) {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated pointer-events-none');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '405';
        this._canvas = canvas;

        targetMap.getPanes().overlayPane.appendChild(canvas);
        targetMap.on('moveend zoomend resize', this._draw, this);
        this._draw();
        return this;
      },

      onRemove(targetMap: L.Map) {
        targetMap.off('moveend zoomend resize', this._draw, this);
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
      },

      _draw() {
        const canvas: HTMLCanvasElement = this._canvas;
        if (!canvas) return;
        const size = map.getSize();
        if (size.x === 0 || size.y === 0) return;

        const topLeft = map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(canvas, topLeft);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(size.x * dpr);
        canvas.height = Math.round(size.y * dpr);
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.x, size.y);

        // 1. Geo-anchored L-band SAR Backscatter Dune Crest Texture inside each active Erg
        if (renderSarTexture || visible) {
          const activeErgs =
            selectedErg === 'All'
              ? ERG_REGIONS
              : ERG_REGIONS.filter((e) => e.name === selectedErg);

          const zoom = map.getZoom();
          // Ground-fixed ridge spacing (~1.6 km wavelength projected to screen px)
          const pixelsPerMeter = (256 * Math.pow(2, zoom)) / 40075016.686;
          const ridgeSpacing = Math.max(6, Math.min(26, 2200 * pixelsPerMeter));

          for (const erg of activeErgs) {
            ctx.save();
            ctx.beginPath();
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;

            erg.polygon.forEach(([lon, lat], i) => {
              const pt = map.latLngToContainerPoint([lat, lon]);
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
              if (i === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            });
            ctx.closePath();
            ctx.clip();

            // Fill crisp radar backscatter base when SAR Radar basemap is selected
            if (renderSarTexture) {
              ctx.fillStyle = 'rgba(10, 15, 24, 0.72)';
              ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
            }

            // Anchor origin strictly to the Erg's fixed Earth coordinate so ridges NEVER swim on pan
            const anchorPt = map.latLngToContainerPoint(erg.center);
            const rad = ((erg.dominantAzimuthDeg - 90) * Math.PI) / 180;
            // Realistic physical shift in meters converted cleanly to screen pixels (sub-pixel per 12 days)
            const physicalShiftM = (epoch.daysSinceBaseline / 365.25) * erg.meanSpeedMYr;
            const shiftPx = physicalShiftM * pixelsPerMeter;

            const diag = Math.hypot(maxX - minX, maxY - minY) + 120;
            ctx.translate(anchorPt.x, anchorPt.y);
            ctx.rotate(rad);

            const startIdx = Math.floor((-diag) / ridgeSpacing) - 1;
            const endIdx = Math.ceil(diag / ridgeSpacing) + 1;

            ctx.strokeStyle = renderSarTexture
              ? 'rgba(186, 230, 253, 0.34)'
              : 'rgba(226, 232, 240, 0.14)';
            ctx.lineWidth = renderSarTexture ? 1.25 : 0.9;

            for (let k = startIdx; k <= endIdx; k++) {
              const offset = k * ridgeSpacing + shiftPx;
              ctx.beginPath();
              for (let y = -diag * 0.7; y <= diag * 0.7; y += 14) {
                const ripple = Math.sin(y * 0.055 + k * 0.7) * (ridgeSpacing * 0.24);
                if (y === -diag * 0.7) ctx.moveTo(offset + ripple, y);
                else ctx.lineTo(offset + ripple, y);
              }
              ctx.stroke();
            }

            ctx.restore();
          }
        }

        // 2. Stationary NISAR 240 km orbital SweepSAR track footprints (active pass highlighted per date)
        if (visible) {
          ctx.save();
          for (let s = 0; s < SWATH_LONGITUDES.length; s++) {
            const lonCenter = SWATH_LONGITUDES[s];
            const isActiveTrack = s === epoch.trackIndex;

            const pTopLeft = map.latLngToContainerPoint([32.3, lonCenter - 1.25]);
            const pTopRight = map.latLngToContainerPoint([32.3, lonCenter + 1.15]);
            const pBotRight = map.latLngToContainerPoint([16.4, lonCenter + 0.05]);
            const pBotLeft = map.latLngToContainerPoint([16.4, lonCenter - 2.35]);

            ctx.beginPath();
            ctx.moveTo(pTopLeft.x, pTopLeft.y);
            ctx.lineTo(pTopRight.x, pTopRight.y);
            ctx.lineTo(pBotRight.x, pBotRight.y);
            ctx.lineTo(pBotLeft.x, pBotLeft.y);
            ctx.closePath();

            ctx.fillStyle = isActiveTrack
              ? 'rgba(34, 211, 238, 0.07)'
              : 'rgba(56, 189, 248, 0.015)';
            ctx.fill();

            ctx.strokeStyle = isActiveTrack
              ? 'rgba(34, 211, 238, 0.42)'
              : 'rgba(100, 116, 139, 0.16)';
            ctx.lineWidth = isActiveTrack ? 1.15 : 0.75;
            ctx.setLineDash(isActiveTrack ? [6, 4] : [3, 5]);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
      },
    });

    const layer = new (SwathOverlay as unknown as new () => L.Layer)();
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, visible, renderSarTexture, epoch, selectedErg]);

  return null;
}
