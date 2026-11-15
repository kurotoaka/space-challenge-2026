import type { Feature, Polygon } from 'geojson';

/**
 * Accurate simplified border polygon of the Kingdom of Saudi Arabia (lon, lat)
 * traced counter-clockwise for inner hole masking inside a clockwise world outer ring.
 */
export const SAUDI_BORDER_RING: [number, number][] = [
  [34.62, 28.05], // Gulf of Aqaba / Haql
  [34.95, 29.36], // Jordan border west
  [36.05, 29.18],
  [36.78, 29.85],
  [37.45, 30.52],
  [38.28, 31.65],
  [39.20, 32.15], // Northern tip near Turaif
  [40.42, 31.82], // Iraq border
  [41.88, 31.22],
  [43.45, 30.42],
  [44.75, 29.88],
  [46.55, 29.10], // Hafr Al-Batin / Kuwait tri-point
  [47.72, 29.12],
  [48.42, 28.54], // Khafji coast
  [49.35, 27.62], // Jubail coast
  [50.18, 26.38], // Dammam / Khobar
  [50.25, 25.60], // Half Moon Bay
  [50.82, 24.72], // Salwa / Qatar border
  [51.58, 24.15], // Batha / UAE border
  [52.65, 22.95],
  [55.02, 22.72],
  [55.66, 22.02], // Oman tri-point
  [55.20, 20.55],
  [53.45, 19.35],
  [52.00, 18.95], // Yemen border east
  [49.85, 18.62],
  [47.55, 17.42],
  [45.30, 17.28],
  [43.82, 16.95],
  [42.78, 16.38], // Jazan south border
  [42.32, 16.92], // Red Sea coast northwards
  [41.65, 17.85],
  [41.12, 19.15],
  [40.32, 20.15],
  [39.15, 21.48], // Jeddah
  [38.95, 22.55],
  [37.98, 24.08], // Yanbu
  [37.18, 25.05],
  [36.42, 26.22],
  [35.42, 27.42],
  [34.62, 28.05], // Close ring
];

// World outer ring (clockwise in lon/lat for GeoJSON polygon with hole)
const WORLD_OUTER_RING: [number, number][] = [
  [-180, -85],
  [-180, 85],
  [180, 85],
  [180, -85],
  [-180, -85],
];

/**
 * Inverted GeoJSON polygon masking everything outside Saudi Arabia
 * so surrounding countries are dimmed on the Leaflet map.
 */
export const SAUDI_INVERTED_MASK_GEOJSON: Feature<Polygon> = {
  type: 'Feature',
  properties: {
    name: 'Surrounding Countries Mask',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [WORLD_OUTER_RING, SAUDI_BORDER_RING],
  },
};

/**
 * Clean KSA border polygon for crisp outline rendering.
 */
export const SAUDI_BORDER_GEOJSON: Feature<Polygon> = {
  type: 'Feature',
  properties: {
    name: 'Kingdom of Saudi Arabia',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [SAUDI_BORDER_RING],
  },
};
