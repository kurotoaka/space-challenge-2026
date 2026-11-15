import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import { ERG_REGIONS } from '../data/ergRegions';
import type { DriftVector, ErgZoneName } from '../types/geospatial';

interface HeatmapLayerProps {
  vectors: DriftVector[];
  visible: boolean;
  selectedErg: 'All' | ErgZoneName;
}

/**
 * Calibrated dark-canvas colormap for dune drift speed (0..1):
 * Transparent Slate -> Deep Cyan -> Bright Cyan -> Telemetry Amber -> Crimson
 */
function buildColorLut(): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8ClampedArray(256 * 4);

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, 'rgba(8, 145, 178, 0.06)');
  grad.addColorStop(0.28, 'rgba(6, 182, 212, 0.34)');
  grad.addColorStop(0.54, 'rgba(245, 158, 11, 0.48)');
  grad.addColorStop(0.78, 'rgba(234, 88, 12, 0.58)');
  grad.addColorStop(1.0, 'rgba(225, 29, 72, 0.68)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

/**
 * High-resolution IDW-interpolated velocity heatmap masked tightly inside Saudi Arabia's
 * 4 georeferenced sand sea polygons so intensity follows real dune seas rather than blobs.
 */
export function HeatmapLayer({ vectors, visible, selectedErg }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!visible || vectors.length === 0) return;

    const lut = buildColorLut();
    const offscreen = document.createElement('canvas');

    const ErgHeatmapOverlay = L.Layer.extend({
      onAdd(targetMap: L.Map) {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated pointer-events-none');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '410';
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

        canvas.width = size.x;
        canvas.height = size.y;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, size.x, size.y);

        // Downsampled interpolation grid (4px resolution upscaled with bilinear smoothing)
        const scale = 4;
        const gw = Math.max(1, Math.ceil(size.x / scale));
        const gh = Math.max(1, Math.ceil(size.y / scale));
        offscreen.width = gw;
        offscreen.height = gh;
        const octx = offscreen.getContext('2d', { willReadFrequently: true });
        if (!octx) return;

        const projected = vectors
          .map((vec) => {
            const pt = map.latLngToContainerPoint([vec.lat, vec.lon]);
            return {
              x: pt.x / scale,
              y: pt.y / scale,
              speed: vec.speed_m_yr,
              erg: vec.erg_zone,
            };
          })
          .filter(
            (p) =>
              p.x >= -40 &&
              p.y >= -40 &&
              p.x <= gw + 40 &&
              p.y <= gh + 40 &&
              (selectedErg === 'All' || p.erg === selectedErg)
          );

        if (projected.length === 0) return;

        const img = octx.createImageData(gw, gh);
        const px = img.data;
        const zoom = map.getZoom();
        const influenceRadiusSq = Math.pow(Math.max(14, Math.min(48, 12 * Math.pow(1.38, zoom - 5))), 2);
        const maxSpeed = 27.5;
        const minSpeed = 4.0;

        for (let gy = 0; gy < gh; gy++) {
          for (let gx = 0; gx < gw; gx++) {
            let wSum = 0;
            let vSum = 0;
            let minDistSq = Infinity;

            for (let k = 0; k < projected.length; k++) {
              const p = projected[k];
              const dx = gx - p.x;
              const dy = gy - p.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < minDistSq) minDistSq = d2;
              if (d2 > influenceRadiusSq) continue;
              const w = 1.0 / (d2 + 4.5);
              wSum += w;
              vSum += w * p.speed;
            }

            if (wSum > 0 && minDistSq < influenceRadiusSq * 0.72) {
              const speed = vSum / wSum;
              const norm = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));
              const edgeFade = Math.max(0, Math.min(1, 1 - minDistSq / (influenceRadiusSq * 0.72)));
              const lutIdx = Math.round(norm * 255) * 4;
              const idx = (gy * gw + gx) * 4;
              px[idx] = lut[lutIdx];
              px[idx + 1] = lut[lutIdx + 1];
              px[idx + 2] = lut[lutIdx + 2];
              px[idx + 3] = Math.round(lut[lutIdx + 3] * Math.sqrt(edgeFade));
            }
          }
        }

        octx.putImageData(img, 0, 0);

        // Clip cleanly to active Erg region polygon(s) so heatmap hugs exact sand sea geography
        const activeErgs =
          selectedErg === 'All'
            ? ERG_REGIONS
            : ERG_REGIONS.filter((e) => e.name === selectedErg);

        ctx.save();
        ctx.beginPath();
        for (const erg of activeErgs) {
          erg.polygon.forEach(([lon, lat], i) => {
            const pt = map.latLngToContainerPoint([lat, lon]);
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
          });
          ctx.closePath();
        }
        ctx.clip();

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreen, 0, 0, size.x, size.y);
        ctx.restore();
      },
    });

    const layer = new (ErgHeatmapOverlay as unknown as new () => L.Layer)();
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, vectors, visible, selectedErg]);

  return null;
}
