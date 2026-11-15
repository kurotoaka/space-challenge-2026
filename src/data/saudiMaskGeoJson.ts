import type { Feature, Polygon } from 'geojson';

/**
 * 2x+ higher-resolution border polygon of the Kingdom of Saudi Arabia (lon, lat)
 * traced counter-clockwise for inner hole masking inside a clockwise world outer ring.
 */
export const SAUDI_BORDER_RING: [number, number][] = [
  // Gulf of Aqaba & Jordan NW border
  [34.57, 28.08],
  [34.68, 28.62],
  [34.86, 29.18],
  [34.96, 29.36],
  [35.42, 29.28],
  [36.04, 29.18],
  [36.38, 29.52],
  [36.74, 29.88],
  [37.18, 30.26],
  [37.54, 30.58],
  [37.94, 31.12],
  [38.28, 31.66],
  [38.74, 31.98],
  [39.20, 32.15], // Northern tip near Turaif
  // Iraq northern border
  [39.85, 31.98],
  [40.48, 31.78],
  [41.18, 31.50],
  [41.92, 31.20],
  [42.68, 30.82],
  [43.46, 30.40],
  [44.18, 30.12],
  [44.78, 29.88],
  [45.65, 29.48],
  [46.55, 29.10], // Hafr Al-Batin / Kuwait tri-point
  // Kuwait & Arabian Gulf coast
  [47.18, 29.12],
  [47.74, 29.10],
  [48.12, 28.82],
  [48.44, 28.54], // Khafji
  [48.88, 28.08],
  [49.36, 27.60], // Jubail
  [49.82, 27.02],
  [50.14, 26.44], // Dammam / Khobar
  [50.22, 25.95],
  [50.25, 25.58], // Half Moon Bay
  [50.48, 25.12],
  [50.82, 24.72], // Salwa / Qatar border
  [51.22, 24.42],
  // UAE & Oman Rub' al Khali eastern borders
  [51.58, 24.16], // Batha
  [52.12, 23.56],
  [52.66, 22.96],
  [53.85, 22.84],
  [55.02, 22.72],
  [55.36, 22.38],
  [55.66, 22.02], // Oman tri-point
  [55.44, 21.28],
  [55.18, 20.54],
  [54.34, 19.92],
  [53.46, 19.34],
  [52.72, 19.12],
  // Yemen southern border
  [52.00, 18.95],
  [50.94, 18.78],
  [49.86, 18.62],
  [48.72, 18.02],
  [47.55, 17.42],
  [46.42, 17.34],
  [45.30, 17.28],
  [44.54, 17.12],
  [43.82, 16.95],
  [43.28, 16.68],
  [42.78, 16.38], // Jazan south border
  // Red Sea coastline northwards
  [42.54, 16.64],
  [42.32, 16.92],
  [41.98, 17.38],
  [41.64, 17.86],
  [41.38, 18.52],
  [41.12, 19.16],
  [40.72, 19.66],
  [40.32, 20.16],
  [39.74, 20.82],
  [39.16, 21.48], // Jeddah
  [39.04, 22.02],
  [38.94, 22.56],
  [38.46, 23.32],
  [37.98, 24.08], // Yanbu
  [37.56, 24.58],
  [37.18, 25.06],
  [36.80, 25.64],
  [36.42, 26.22],
  [35.92, 26.82],
  [35.42, 27.42],
  [34.96, 27.78],
  [34.57, 28.08], // Close ring
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
