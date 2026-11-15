import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { DriftVector } from '../types/geospatial';

interface HeatmapLayerProps {
  vectors: DriftVector[];
  visible: boolean;
}

/**
 * Calibrated 4-stop thermal velocity ramp:
 * Low (0.0) -> Sky/Cyan -> Amber -> Crimson High (1.0)
 */
function buildColorPalette(): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new Uint8ClampedArray(256 * 4);
  }
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, 'rgba(14, 165, 233, 0.0)');
  grad.addColorStop(0.25, 'rgba(6, 182, 212, 0.48)');
  grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.72)');
  grad.addColorStop(0.82, 'rgba(234, 88, 12, 0.84)');
  grad.addColorStop(1.0, 'rgba(220, 38, 38, 0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

/**
 * Lightweight HTML5 Canvas Leaflet overlay that renders dune drift velocity
 * intensity contours without blocking map interaction or external heatmap plugins.
 */
export function HeatmapLayer({ vectors, visible }: HeatmapLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!visible || vectors.length === 0) {
      return;
    }

    const palette = buildColorPalette();

    const CanvasHeatOverlay = L.Layer.extend({
      onAdd(targetMap: L.Map) {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated pointer-events-none');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '410';
        this._canvas = canvas;

        const pane = targetMap.getPanes().overlayPane;
        pane.appendChild(canvas);

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

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.clearRect(0, 0, size.x, size.y);

        // Scale Gaussian kernel radius smoothly with map zoom so adjacent erg vectors blend
        const zoom = map.getZoom();
        const radius = Math.max(46, Math.min(125, Math.round(30 * Math.pow(1.42, zoom - 4))));
        const maxSpeed = 27.0;

        for (const vec of vectors) {
          const pt = map.latLngToContainerPoint([vec.lat, vec.lon]);
          if (
            pt.x < -radius ||
            pt.y < -radius ||
            pt.x > size.x + radius ||
            pt.y > size.y + radius
          ) {
            continue;
          }
          const intensity = Math.max(0.24, Math.min(1.0, vec.speed_m_yr / maxSpeed));
          const radGrad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
          radGrad.addColorStop(0, `rgba(0, 0, 0, ${intensity * 0.85})`);
          radGrad.addColorStop(0.55, `rgba(0, 0, 0, ${intensity * 0.35})`);
          radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = radGrad;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        const imgData = ctx.getImageData(0, 0, size.x, size.y);
        const px = imgData.data;
        for (let i = 0; i < px.length; i += 4) {
          const alpha = px[i + 3];
          if (alpha > 0) {
            const lutIdx = alpha * 4;
            px[i] = palette[lutIdx];
            px[i + 1] = palette[lutIdx + 1];
            px[i + 2] = palette[lutIdx + 2];
            px[i + 3] = Math.min(205, Math.round(palette[lutIdx + 3] * 0.85));
          }
        }
        ctx.putImageData(imgData, 0, 0);
      },
    });

    const layer = new (CanvasHeatOverlay as unknown as new () => L.Layer)();
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, vectors, visible]);

  return null;
}
