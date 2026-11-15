import { useEffect, useRef } from 'react';
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
 * Uses O(1) spatial cell occupancy and persistent layer refs so zooming and scrubbing
 * wind sliders trigger rAF redraws without Leaflet layer teardown.
 */
export function DriftVectorsLayer({ vectors, visible, selectedErg }: DriftVectorsLayerProps) {
  const map = useMap();
  const vectorsRef = useRef(vectors);
  const visibleRef = useRef(visible);
  const selectedErgRef = useRef(selectedErg);
  const redrawRef = useRef<(() => void) | null>(null);

  vectorsRef.current = vectors;
  visibleRef.current = visible;
  selectedErgRef.current = selectedErg;

  useEffect(() => {
    let rafId: number | null = null;

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
        targetMap.on('moveend zoomend resize', this._scheduleDraw, this);
        this._draw();
        return this;
      },

      onRemove(targetMap: L.Map) {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        targetMap.off('moveend zoomend resize', this._scheduleDraw, this);
        if (this._canvas && this._canvas.parentNode) {
          this._canvas.parentNode.removeChild(this._canvas);
        }
      },

      _scheduleDraw() {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
        rafId = requestAnimationFrame(() => {
          rafId = null;
          this._draw();
        });
      },

      _draw() {
        const canvas: HTMLCanvasElement | undefined = this._canvas;
        if (!canvas) return;
        const size = map.getSize();
        if (size.x === 0 || size.y === 0) return;

        const topLeft = map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(canvas, topLeft);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetW = Math.round(size.x * dpr);
        const targetH = Math.round(size.y * dpr);
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
          canvas.style.width = `${size.x}px`;
          canvas.style.height = `${size.y}px`;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.x, size.y);

        const curVectors = vectorsRef.current;
        const curVisible = visibleRef.current;
        const curErg = selectedErgRef.current;
        if (!curVisible || curVectors.length === 0) return;

        const zoom = map.getZoom();
        const minGapPx = zoom >= 8 ? 16 : zoom >= 7 ? 20 : 24;
        const occupied = new Map<number, Array<[number, number]>>();
        const minGapSq = minGapPx * minGapPx;
        const gridCols = Math.ceil((size.x + 60) / minGapPx) + 2;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = zoom >= 8 ? 1.3 : 1.1;

        for (let idx = 0; idx < curVectors.length; idx++) {
          const vec = curVectors[idx];
          if (curErg !== 'All' && vec.erg_zone !== curErg) continue;

          const pt = map.latLngToContainerPoint([vec.lat, vec.lon]);
          if (pt.x < -20 || pt.y < -20 || pt.x > size.x + 20 || pt.y > size.y + 20) {
            continue;
          }

          const cx = Math.floor((pt.x + 20) / minGapPx) + 1;
          const cy = Math.floor((pt.y + 20) / minGapPx) + 1;
          let tooClose = false;

          for (let dy = -1; dy <= 1 && !tooClose; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const cell = occupied.get((cy + dy) * gridCols + (cx + dx));
              if (!cell) continue;
              for (let k = 0; k < cell.length; k++) {
                const vx = pt.x - cell[k][0];
                const vy = pt.y - cell[k][1];
                if (vx * vx + vy * vy < minGapSq) {
                  tooClose = true;
                  break;
                }
              }
              if (tooClose) break;
            }
          }
          if (tooClose) continue;

          const key = cy * gridCols + cx;
          let bucket = occupied.get(key);
          if (!bucket) {
            bucket = [];
            occupied.set(key, bucket);
          }
          bucket.push([pt.x, pt.y]);

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

    const layer = new (VectorFieldOverlay as unknown as new () => L.Layer & { _scheduleDraw: () => void })();
    redrawRef.current = () => layer._scheduleDraw();
    layer.addTo(map);
    return () => {
      redrawRef.current = null;
      map.removeLayer(layer);
    };
  }, [map]);

  useEffect(() => {
    redrawRef.current?.();
  }, [vectors, visible, selectedErg]);

  return null;
}
