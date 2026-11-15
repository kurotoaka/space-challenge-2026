import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import type { DriftVector, ErgZoneName } from '../types/geospatial';

interface DriftVectorsLayerProps {
  vectors: DriftVector[];
  visible: boolean;
  selectedErg: 'All' | ErgZoneName;
}

function getStrokeColor(speed: number): string {
  if (speed >= 21) return 'rgba(251, 113, 133, 0.92)'; // Rose high-velocity
  if (speed >= 15) return 'rgba(251, 191, 36, 0.88)';  // Amber moderate-fast
  return 'rgba(34, 211, 238, 0.82)';                   // Cyan steady drift
}

/**
 * High-DPI Canvas directional vector field overlay.
 * Renders crisp 1.15px micro-arrows without bulky DOM polylines, automatically thinning
 * dense points at continental zoom and revealing full sub-erg detail when zoomed in.
 */
export function DriftVectorsLayer({ vectors, visible, selectedErg }: DriftVectorsLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!visible || vectors.length === 0) return;

    const VectorFieldOverlay = L.Layer.extend({
      onAdd(targetMap: L.Map) {
        const canvas = L.DomUtil.create('canvas', 'leaflet-zoom-animated pointer-events-none');
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '420';
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

        const zoom = map.getZoom();
        // Minimum screen-space separation prevents cluttered overlapping arrows
        const minGapPx = zoom >= 8 ? 16 : zoom >= 7 ? 20 : 24;
        const minGapSq = minGapPx * minGapPx;
        const placed: Array<[number, number]> = [];

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = zoom >= 8 ? 1.3 : 1.1;

        for (const vec of vectors) {
          if (selectedErg !== 'All' && vec.erg_zone !== selectedErg) {
            continue;
          }
          const pt = map.latLngToContainerPoint([vec.lat, vec.lon]);
          if (pt.x < -20 || pt.y < -20 || pt.x > size.x + 20 || pt.y > size.y + 20) {
            continue;
          }

          let tooClose = false;
          for (let i = 0; i < placed.length; i++) {
            const dx = pt.x - placed[i][0];
            const dy = pt.y - placed[i][1];
            if (dx * dx + dy * dy < minGapSq) {
              tooClose = true;
              break;
            }
          }
          if (tooClose) continue;
          placed.push([pt.x, pt.y]);

          // Crisp micro-vector length in pixels scaled cleanly by speed & zoom
          const lenPx = Math.max(9, Math.min(22, 6 + vec.speed_m_yr * 0.45 + (zoom - 6) * 2.2));
          const rad = (vec.azimuth_deg * Math.PI) / 180;
          const sinA = Math.sin(rad);
          const cosA = Math.cos(rad);

          const x0 = pt.x - (lenPx * 0.38) * sinA;
          const y0 = pt.y + (lenPx * 0.38) * cosA;
          const x1 = pt.x + (lenPx * 0.62) * sinA;
          const y1 = pt.y - (lenPx * 0.62) * cosA;

          const headLen = Math.max(3.6, lenPx * 0.28);
          const leftRad = ((vec.azimuth_deg + 148) * Math.PI) / 180;
          const rightRad = ((vec.azimuth_deg - 148) * Math.PI) / 180;

          ctx.strokeStyle = getStrokeColor(vec.speed_m_yr);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.moveTo(x1 + headLen * Math.sin(leftRad), y1 - headLen * Math.cos(leftRad));
          ctx.lineTo(x1, y1);
          ctx.lineTo(x1 + headLen * Math.sin(rightRad), y1 - headLen * Math.cos(rightRad));
          ctx.stroke();
        }
      },
    });

    const layer = new (VectorFieldOverlay as unknown as new () => L.Layer)();
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, vectors, visible, selectedErg]);

  return null;
}
