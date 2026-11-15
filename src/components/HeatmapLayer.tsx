import { useEffect, useRef } from 'react';
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
 * Translucent Cyan -> Teal -> Telemetry Amber -> Warm Crimson
 */
function buildColorLut(): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new Uint8ClampedArray(256 * 4);

  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, 'rgba(8, 145, 178, 0.16)');
  grad.addColorStop(0.28, 'rgba(6, 182, 212, 0.34)');
  grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.44)');
  grad.addColorStop(0.78, 'rgba(234, 88, 12, 0.52)');
  grad.addColorStop(1.0, 'rgba(225, 29, 72, 0.58)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

/**
 * Continuous, diffuse geographic IDW velocity heatmap masked cleanly inside Saudi Arabia's
 * 4 sand seas. Uses geographic-degree kernel distances rather than fixed pixel circles so
 * zooming in (zoom 8-13) produces a seamless atmospheric gradient instead of circular blobs.
 */
export function HeatmapLayer({ vectors, visible, selectedErg }: HeatmapLayerProps) {
  const map = useMap();
  const vectorsRef = useRef(vectors);
  const visibleRef = useRef(visible);
  const selectedErgRef = useRef(selectedErg);
  const redrawRef = useRef<(() => void) | null>(null);

  vectorsRef.current = vectors;
  visibleRef.current = visible;
  selectedErgRef.current = selectedErg;

  useEffect(() => {
    const lut = buildColorLut();
    const offscreen = document.createElement('canvas');
    let rafId: number | null = null;

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

        if (canvas.width !== size.x || canvas.height !== size.y) {
          canvas.width = size.x;
          canvas.height = size.y;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, size.x, size.y);

        const curVectors = vectorsRef.current;
        const curVisible = visibleRef.current;
        const curErg = selectedErgRef.current;
        if (!curVisible || curVectors.length === 0) return;

        const zoom = map.getZoom();
        // Smooth coarse grid upscaled with GPU bilinear + blur filter -> zero circles at any zoom
        const scale = zoom >= 9 ? 14 : zoom >= 7 ? 10 : 7;
        const gw = Math.max(1, Math.ceil(size.x / scale));
        const gh = Math.max(1, Math.ceil(size.y / scale));
        if (offscreen.width !== gw || offscreen.height !== gh) {
          offscreen.width = gw;
          offscreen.height = gh;
        }
        const octx = offscreen.getContext('2d');
        if (!octx) return;

        // Project active Erg polygons to find screen bounding box
        const activeErgs =
          curErg === 'All' ? ERG_REGIONS : ERG_REGIONS.filter((e) => e.name === curErg);

        let polyMinX = Infinity;
        let polyMaxX = -Infinity;
        let polyMinY = Infinity;
        let polyMaxY = -Infinity;

        const projectedRings: Array<Array<[number, number]>> = [];
        for (const erg of activeErgs) {
          const ring: Array<[number, number]> = [];
          for (let i = 0; i < erg.polygon.length; i++) {
            const [lon, lat] = erg.polygon[i];
            const pt = map.latLngToContainerPoint([lat, lon]);
            ring.push([pt.x, pt.y]);
            if (pt.x < polyMinX) polyMinX = pt.x;
            if (pt.x > polyMaxX) polyMaxX = pt.x;
            if (pt.y < polyMinY) polyMinY = pt.y;
            if (pt.y > polyMaxY) polyMaxY = pt.y;
          }
          projectedRings.push(ring);
        }

        if (polyMaxX < 0 || polyMinX > size.x || polyMaxY < 0 || polyMinY > size.y) {
          return;
        }

        // Clamp rasterization bounds with padding so diffuse filter blur never fringes at edges
        const gxMin = Math.max(0, Math.floor(polyMinX / scale) - 2);
        const gxMax = Math.min(gw - 1, Math.ceil(polyMaxX / scale) + 2);
        const gyMin = Math.max(0, Math.floor(polyMinY / scale) - 2);
        const gyMax = Math.min(gh - 1, Math.ceil(polyMaxY / scale) + 2);

        // Exact geographic coordinates for each grid row & column for true Earth-space IDW
        const bounds = map.getBounds();
        const northLat = bounds.getNorth();
        const southLat = bounds.getSouth();
        const westLon = bounds.getWest();
        const eastLon = bounds.getEast();

        // Include generous geographic margin (±1.8°) so vectors outside the viewport contribute seamlessly
        const marginDeg = 1.8;
        const nearbyVectors: Array<{ lat: number; lon: number; speed: number }> = [];
        for (let i = 0; i < curVectors.length; i++) {
          const v = curVectors[i];
          if (curErg !== 'All' && v.erg_zone !== curErg) continue;
          if (
            v.lat >= southLat - marginDeg &&
            v.lat <= northLat + marginDeg &&
            v.lon >= westLon - marginDeg &&
            v.lon <= eastLon + marginDeg
          ) {
            nearbyVectors.push({ lat: v.lat, lon: v.lon, speed: v.speed_m_yr });
          }
        }

        if (nearbyVectors.length === 0) return;

        // Precompute exact per-column lon and per-row lat in Earth coordinates
        const colLons = new Float64Array(gw);
        for (let gx = gxMin; gx <= gxMax; gx++) {
          colLons[gx] = map.containerPointToLatLng([gx * scale + scale * 0.5, 0]).lng;
        }
        const rowLats = new Float64Array(gh);
        for (let gy = gyMin; gy <= gyMax; gy++) {
          rowLats[gy] = map.containerPointToLatLng([0, gy * scale + scale * 0.5]).lat;
        }

        // Bucket nearby vectors into 0.85° cells so 3×3 covers >1.7° everywhere inside Ergs
        const cellDeg = 0.85;
        const gLatMin = Math.floor((southLat - marginDeg) / cellDeg);
        const gLonMin = Math.floor((westLon - marginDeg) / cellDeg);
        const gRows = Math.ceil((northLat - southLat + marginDeg * 2) / cellDeg) + 2;
        const gCols = Math.ceil((eastLon - westLon + marginDeg * 2) / cellDeg) + 2;
        const geoBuckets: Array<Array<{ lat: number; lon: number; speed: number }>> = new Array(
          gRows * gCols
        );

        for (let i = 0; i < nearbyVectors.length; i++) {
          const v = nearbyVectors[i];
          const r = Math.max(0, Math.min(gRows - 1, Math.floor(v.lat / cellDeg) - gLatMin));
          const c = Math.max(0, Math.min(gCols - 1, Math.floor(v.lon / cellDeg) - gLonMin));
          const key = r * gCols + c;
          if (!geoBuckets[key]) geoBuckets[key] = [];
          geoBuckets[key].push(v);
        }

        const img = octx.createImageData(gw, gh);
        const px = img.data;
        const maxSpeed = 27.5;
        const minSpeed = 4.0;
        const spanSpeed = maxSpeed - minSpeed;

        // Wide smoothing kernel in degrees^2 + zero hard cutoff radius = pure diffuse field at ALL zooms
        const smoothingDegSq = 0.045;
        const alphaAtten = zoom >= 14 ? 0.55 : zoom >= 10 ? 0.72 : zoom >= 8 ? 0.85 : 1.0;

        for (let gy = gyMin; gy <= gyMax; gy++) {
          const lat = rowLats[gy];
          const cosLatSq = Math.pow(Math.cos((lat * Math.PI) / 180), 2);
          const br = Math.max(0, Math.min(gRows - 1, Math.floor(lat / cellDeg) - gLatMin));
          const r0 = Math.max(0, br - 1);
          const r1 = Math.min(gRows - 1, br + 1);

          for (let gx = gxMin; gx <= gxMax; gx++) {
            const lon = colLons[gx];
            const bc = Math.max(0, Math.min(gCols - 1, Math.floor(lon / cellDeg) - gLonMin));
            const c0 = Math.max(0, bc - 1);
            const c1 = Math.min(gCols - 1, bc + 1);

            let wSum = 0;
            let vSum = 0;

            for (let rr = r0; rr <= r1; rr++) {
              const rowOff = rr * gCols;
              for (let cc = c0; cc <= c1; cc++) {
                const list = geoBuckets[rowOff + cc];
                if (!list) continue;
                for (let k = 0; k < list.length; k++) {
                  const p = list[k];
                  const dLat = lat - p.lat;
                  const dLon = lon - p.lon;
                  const d2Deg = dLat * dLat + dLon * dLon * cosLatSq;
                  // Smooth Gaussian-like rational IDW weight with NO step/circle boundary
                  const w = 1.0 / (d2Deg + smoothingDegSq);
                  wSum += w;
                  vSum += w * p.speed;
                }
              }
            }

            if (wSum > 0) {
              const speed = vSum / wSum;
              const norm = Math.max(0, Math.min(1, (speed - minSpeed) / spanSpeed));
              const lutIdx = Math.round(norm * 255) * 4;
              const idx = (gy * gw + gx) * 4;
              px[idx] = lut[lutIdx];
              px[idx + 1] = lut[lutIdx + 1];
              px[idx + 2] = lut[lutIdx + 2];
              px[idx + 3] = Math.round(lut[lutIdx + 3] * alphaAtten);
            }
          }
        }

        octx.putImageData(img, 0, 0);

        ctx.save();
        ctx.beginPath();
        for (let r = 0; r < projectedRings.length; r++) {
          const ring = projectedRings[r];
          for (let i = 0; i < ring.length; i++) {
            if (i === 0) ctx.moveTo(ring[i][0], ring[i][1]);
            else ctx.lineTo(ring[i][0], ring[i][1]);
          }
          ctx.closePath();
        }
        ctx.clip();

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        // Soft diffuse filter at high zoom blends grid interpolation into an atmospheric heatmap wash
        ctx.filter = zoom >= 9 ? 'blur(14px)' : zoom >= 7 ? 'blur(6px)' : 'blur(2px)';
        ctx.drawImage(offscreen, 0, 0, size.x, size.y);
        ctx.filter = 'none';
        ctx.restore();
      },
    });

    const layer = new (ErgHeatmapOverlay as unknown as new () => L.Layer & { _scheduleDraw: () => void })();
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
