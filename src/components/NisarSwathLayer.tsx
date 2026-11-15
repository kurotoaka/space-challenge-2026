import { useEffect, useRef } from 'react';
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
 * Renders stationary 12-day repeat-orbit NISAR SweepSAR corridors plus viewport-culled
 * geo-anchored L-band SAR dune-crest backscatter ridges. Strictly projects ridges onto the
 * visible viewport span so zoom levels 9-13 render in <2ms instead of plotting millions of offscreen vertices.
 */
export function NisarSwathLayer({ visible, baseMap, epoch, selectedErg }: NisarSwathLayerProps) {
  const map = useMap();
  const renderSarTexture = baseMap === 'sar';

  const visibleRef = useRef(visible);
  const renderSarRef = useRef(renderSarTexture);
  const epochRef = useRef(epoch);
  const selectedErgRef = useRef(selectedErg);
  const redrawRef = useRef<(() => void) | null>(null);

  visibleRef.current = visible;
  renderSarRef.current = renderSarTexture;
  epochRef.current = epoch;
  selectedErgRef.current = selectedErg;

  useEffect(() => {
    let rafId: number | null = null;

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

        const curVisible = visibleRef.current;
        const curSar = renderSarRef.current;
        const curEpoch = epochRef.current;
        const curErg = selectedErgRef.current;

        if (!curVisible && !curSar) return;

        // 1. Geo-anchored L-band SAR Backscatter Dune Crest Texture inside visible portions of active Ergs
        const activeErgs =
          curErg === 'All' ? ERG_REGIONS : ERG_REGIONS.filter((e) => e.name === curErg);

        const zoom = map.getZoom();
        const pixelsPerMeter = (256 * Math.pow(2, zoom)) / 40075016.686;
        const ridgeSpacing = Math.max(7, Math.min(28, 2200 * pixelsPerMeter));
        const halfScreenDiag = Math.hypot(size.x, size.y) * 0.62;
        const viewCenterX = size.x * 0.5;
        const viewCenterY = size.y * 0.5;
        const yStep = Math.max(16, Math.round(halfScreenDiag / 28));

        for (let eIdx = 0; eIdx < activeErgs.length; eIdx++) {
          const erg = activeErgs[eIdx];
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;

          const polyPts: Array<[number, number]> = new Array(erg.polygon.length);
          for (let i = 0; i < erg.polygon.length; i++) {
            const [lon, lat] = erg.polygon[i];
            const pt = map.latLngToContainerPoint([lat, lon]);
            polyPts[i] = [pt.x, pt.y];
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }

          // Cull ergs completely outside visible viewport
          if (maxX < 0 || minX > size.x || maxY < 0 || minY > size.y) {
            continue;
          }

          ctx.save();
          ctx.beginPath();
          for (let i = 0; i < polyPts.length; i++) {
            if (i === 0) ctx.moveTo(polyPts[i][0], polyPts[i][1]);
            else ctx.lineTo(polyPts[i][0], polyPts[i][1]);
          }
          ctx.closePath();
          ctx.clip();

          // Clamp fill rect strictly to visible screen bounds
          const visMinX = Math.max(0, minX);
          const visMaxX = Math.min(size.x, maxX);
          const visMinY = Math.max(0, minY);
          const visMaxY = Math.min(size.y, maxY);

          if (curSar && visMaxX > visMinX && visMaxY > visMinY) {
            ctx.fillStyle = 'rgba(10, 15, 24, 0.72)';
            ctx.fillRect(visMinX, visMinY, visMaxX - visMinX, visMaxY - visMinY);
          }

          // Anchor origin strictly to Erg Earth center, then transform viewport center into rotated space
          const anchorPt = map.latLngToContainerPoint(erg.center);
          const rad = ((erg.dominantAzimuthDeg - 90) * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);

          const physicalShiftM = (curEpoch.daysSinceBaseline / 365.25) * erg.meanSpeedMYr;
          const shiftPx = physicalShiftM * pixelsPerMeter;

          // Project viewport center into Erg rotated coordinate frame so only visible ridges draw
          const dxView = viewCenterX - anchorPt.x;
          const dyView = viewCenterY - anchorPt.y;
          const rotCenterX = dxView * cosR + dyView * sinR;
          const rotCenterY = -dxView * sinR + dyView * cosR;

          const startIdx = Math.floor((rotCenterX - halfScreenDiag - shiftPx) / ridgeSpacing) - 1;
          const endIdx = Math.ceil((rotCenterX + halfScreenDiag - shiftPx) / ridgeSpacing) + 1;
          const yStart = rotCenterY - halfScreenDiag;
          const yEnd = rotCenterY + halfScreenDiag;

          ctx.translate(anchorPt.x, anchorPt.y);
          ctx.rotate(rad);

          ctx.strokeStyle = curSar
            ? 'rgba(186, 230, 253, 0.34)'
            : 'rgba(226, 232, 240, 0.14)';
          ctx.lineWidth = curSar ? 1.25 : 0.9;

          for (let k = startIdx; k <= endIdx; k++) {
            const offset = k * ridgeSpacing + shiftPx;
            ctx.beginPath();
            for (let y = yStart; y <= yEnd; y += yStep) {
              const ripple = Math.sin(y * 0.055 + k * 0.7) * (ridgeSpacing * 0.24);
              if (y === yStart) ctx.moveTo(offset + ripple, y);
              else ctx.lineTo(offset + ripple, y);
            }
            ctx.stroke();
          }

          ctx.restore();
        }

        // 2. Stationary NISAR 240 km orbital SweepSAR track footprints
        if (curVisible) {
          ctx.save();
          for (let s = 0; s < SWATH_LONGITUDES.length; s++) {
            const lonCenter = SWATH_LONGITUDES[s];
            const isActiveTrack = s === curEpoch.trackIndex;

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

    const layer = new (SwathOverlay as unknown as new () => L.Layer & { _scheduleDraw: () => void })();
    redrawRef.current = () => layer._scheduleDraw();
    layer.addTo(map);
    return () => {
      redrawRef.current = null;
      map.removeLayer(layer);
    };
  }, [map]);

  useEffect(() => {
    redrawRef.current?.();
  }, [visible, renderSarTexture, epoch, selectedErg]);

  return null;
}
