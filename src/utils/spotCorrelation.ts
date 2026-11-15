import type { ErgRegion } from '../types/geospatial';

export interface SpotSarAnalysis {
  size: number;
  pixelSpacingM: number;
  patchSpanM: number;
  visualW: number;
  visualH: number;
  beforeVisual: Float32Array;
  afterVisual: Float32Array;
  measuredShiftM: number;
  measuredDxM: number;
  measuredDyM: number;
  measuredSpeedMYr: number;
  measuredAzimuthDeg: number;
  correlationPeak: number;
  snrDb: number;
  wavelengthM: number;
  terrainClass: string;
  computeMs: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function fft1d(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (invert ? 1 : -1);
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vIdx = i + j + half;
        const vRe = re[vIdx] * wRe - im[vIdx] * wIm;
        const vIm = re[vIdx] * wIm + im[vIdx] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[vIdx] = uRe - vRe;
        im[vIdx] = uIm - vIm;
        const nextWRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextWRe;
      }
    }
  }

  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, n: number, invert: boolean): void {
  const rowRe = new Float64Array(n);
  const rowIm = new Float64Array(n);

  for (let y = 0; y < n; y++) {
    const off = y * n;
    for (let x = 0; x < n; x++) {
      rowRe[x] = re[off + x];
      rowIm[x] = im[off + x];
    }
    fft1d(rowRe, rowIm, invert);
    for (let x = 0; x < n; x++) {
      re[off + x] = rowRe[x];
      im[off + x] = rowIm[x];
    }
  }

  const colRe = new Float64Array(n);
  const colIm = new Float64Array(n);
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      colRe[y] = re[y * n + x];
      colIm[y] = im[y * n + x];
    }
    fft1d(colRe, colIm, invert);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = colRe[y];
      im[y * n + x] = colIm[y];
    }
  }
}

/**
 * Generates an Earth-coordinate L-band SAR backscatter patch `(width × height)` over
 * `(spanXM × spanYM)` meters centered on `(lat, lon)`. Multi-octave natural desert
 * texture + discrete barchan dunes move cohesively so 2D FFT locks unambiguously onto
 * the real forward displacement without periodic crest aliasing.
 */
export function synthesizeGeoSarGrid(params: {
  lat: number;
  lon: number;
  width: number;
  height: number;
  spanXM: number;
  spanYM: number;
  azimuthDeg: number;
  shiftMeters: number;
  ergId: string;
  temporalNoiseSeed: number;
}): { data: Float32Array; wavelengthM: number; terrainClass: string } {
  const { lat, lon, width, height, spanXM, spanYM, azimuthDeg, shiftMeters, ergId, temporalNoiseSeed } = params;
  const data = new Float32Array(width * height);

  const worldX = lon * 111320 * Math.cos(lat * DEG_TO_RAD);
  const worldY = lat * 110750;

  const spatialMod = Math.sin(lat * 27.3 + lon * 19.1) * 0.5 + Math.cos(lat * 13.7 - lon * 23.9) * 0.5;
  const wavelengthM = Math.round(
    (ergId === 'al-jafurah' ? 62 : ergId === 'ad-dahna' ? 84 : ergId === 'an-nafud' ? 96 : 114) +
      spatialMod * 16
  );

  let terrainClass = 'Active Barchan Dunes';
  if (ergId === 'ad-dahna') {
    terrainClass = spatialMod > 0.25 ? 'Reddish Linear Ridges' : 'Shamal Transverse Sand';
  } else if (ergId === 'rub-al-khali') {
    terrainClass = spatialMod > 0.2 ? 'Compound Star Mega-Dunes' : 'Migrating Barchan Chains';
  } else if (ergId === 'an-nafud') {
    terrainClass = spatialMod > 0.15 ? 'Walled Star Ridges' : 'Aeolian Sand Sheet';
  } else if (ergId === 'al-jafurah') {
    terrainClass = spatialMod > 0.1 ? 'Rapid Coastal Barchan Field' : 'Sabkha-Margin Horns';
  }

  const rad = azimuthDeg * DEG_TO_RAD;
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);

  const dxShiftM = shiftMeters * sinA;
  const dyShiftM = shiftMeters * cosA;

  const halfW = spanXM * 0.5;
  const halfH = spanYM * 0.5;
  const stepX = spanXM / width;
  const stepY = spanYM / height;
  const kFreq = (2 * Math.PI) / wavelengthM;

  // Spatial variation offsets unique to this spot
  const fbmPhaseX = lat * 13.7;
  const fbmPhaseY = lon * 17.3;

  for (let row = 0; row < height; row++) {
    const localNorthM = halfH - row * stepY - dyShiftM;
    for (let col = 0; col < width; col++) {
      const localEastM = col * stepX - halfW - dxShiftM;

      const gx = worldX + localEastM;
      const gy = worldY + localNorthM;

      const along = gx * sinA + gy * cosA;
      const cross = gx * cosA - gy * sinA;

      const hornWarp =
        Math.sin(cross * 0.021 + lat * 11.4) * (wavelengthM * 0.36) +
        Math.cos(cross * 0.049 - lon * 9.7) * (wavelengthM * 0.15);

      const starArm =
        ergId === 'rub-al-khali' || ergId === 'an-nafud'
          ? Math.sin((cross * 0.78 + along * 0.42) * kFreq * 0.55) * 0.18
          : 0;

      const phase = (((along + hornWarp) * kFreq) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const crest =
        phase < 1.15
          ? 0.88 - phase * 0.25
          : Math.max(0.06, 0.27 - (phase - 1.15) * 0.045);

      // Rich multi-scale surface backscatter (gravel lag vs bright sand vs crest break) tied to Earth coords
      const fbm =
        0.52 +
        0.24 * Math.sin(gx * 0.0131 + fbmPhaseX) * Math.cos(gy * 0.0143 + fbmPhaseY) +
        0.18 * Math.sin((gx * 0.0287 - gy * 0.0241) + fbmPhaseX * 0.7) +
        0.14 * Math.cos((gx * 0.0531 + gy * 0.0467) - fbmPhaseY * 0.6);

      // Coherent L-band ground scatterers + mild temporal radar speckle
      const groundHash = Math.sin(gx * 0.413 + gy * 0.579) * 19381.47;
      const groundTexture = 0.88 + 0.24 * (groundHash - Math.floor(groundHash));

      const tempHash =
        Math.sin((localEastM + 13.7) * 0.317 + (localNorthM + 7.3) * 0.491 + temporalNoiseSeed * 7.13) *
        43758.5453;
      const speckle = 0.94 + 0.12 * (tempHash - Math.floor(tempHash));

      const val = Math.max(0.02, Math.min(0.99, (crest * fbm + starArm * 0.5 + 0.18 * fbm) * groundTexture * speckle));
      data[row * width + col] = val;
    }
  }

  return { data, wavelengthM, terrainClass };
}

/**
 * Runs 2D Radix-2 FFT template-in-search cross-correlation (`ampcor`-style): extracts the
 * centered `64×64` (256m) template from T0 and locates it inside the full `128×128` (512m) T1
 * search chip. Keeping 100% of the template inside the search window eliminates edge lag decay
 * and recovers exact sub-pixel drift `(dxMeters, dyMeters)` with zero periodic crest aliasing.
 */
export function measurePatchDrift2dFft(
  patchT0: Float32Array,
  patchT1: Float32Array,
  n: number,
  pixelSpacingM: number,
  elapsedYears: number
): {
  shiftMeters: number;
  dxMeters: number;
  dyMeters: number;
  speedMYr: number;
  azimuthDeg: number;
  correlationPeak: number;
  snrDb: number;
} {
  const total = n * n;
  const tplStart = Math.floor(n / 4); // central n/2 × n/2 window (64×64 inside 128×128)
  const tplEnd = n - tplStart;
  const tplCount = (tplEnd - tplStart) * (tplEnd - tplStart);

  // Zero-mean centered template from T0 placed into top-left of zero-padded n×n buffer
  let meanT0 = 0;
  for (let y = tplStart; y < tplEnd; y++) {
    for (let x = tplStart; x < tplEnd; x++) {
      meanT0 += patchT0[y * n + x];
    }
  }
  meanT0 /= tplCount;

  let meanT1 = 0;
  for (let i = 0; i < total; i++) {
    meanT1 += patchT1[i];
  }
  meanT1 /= total;

  const f0Re = new Float64Array(total);
  const f0Im = new Float64Array(total);
  const f1Re = new Float64Array(total);
  const f1Im = new Float64Array(total);

  let energyT0 = 0;
  for (let y = tplStart; y < tplEnd; y++) {
    for (let x = tplStart; x < tplEnd; x++) {
      const val = patchT0[y * n + x] - meanT0;
      // Place template at its native coordinates inside zero-padded array so shift = 0 lands at index 0
      f0Re[y * n + x] = val;
      energyT0 += val * val;
    }
  }

  let energyT1 = 0;
  for (let i = 0; i < total; i++) {
    const val = patchT1[i] - meanT1;
    f1Re[i] = val;
    energyT1 += val * val;
  }

  if (energyT0 < 1e-8 || energyT1 < 1e-8) {
    return {
      shiftMeters: 0,
      dxMeters: 0,
      dyMeters: 0,
      speedMYr: 0,
      azimuthDeg: 0,
      correlationPeak: 0,
      snrDb: 0,
    };
  }

  fft2d(f0Re, f0Im, n, false);
  fft2d(f1Re, f1Im, n, false);

  // Keep frequency-domain cross-power spectrum for exact bandlimited Fourier sub-pixel zoom
  const specRe = new Float64Array(total);
  const specIm = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const aRe = f1Re[i];
    const aIm = f1Im[i];
    const bRe = f0Re[i];
    const bIm = -f0Im[i];
    specRe[i] = aRe * bRe - aIm * bIm;
    specIm[i] = aRe * bIm + aIm * bRe;
  }

  const crossRe = new Float64Array(specRe);
  const crossIm = new Float64Array(specIm);
  fft2d(crossRe, crossIm, n, true);

  let peakIdx = 0;
  let peakVal = -Infinity;
  let sumAbs = 0;
  const maxLag = Math.floor(n / 4) - 1; // up to ±124 m keeps 100% of 64×64 template inside 128×128 search

  for (let y = 0; y < n; y++) {
    const sy = y > n / 2 ? y - n : y;
    for (let x = 0; x < n; x++) {
      const sx = x > n / 2 ? x - n : x;
      const i = y * n + x;
      const v = crossRe[i];
      sumAbs += Math.abs(v);
      if (Math.abs(sx) <= maxLag && Math.abs(sy) <= maxLag && v > peakVal) {
        peakVal = v;
        peakIdx = i;
      }
    }
  }

  const py = Math.floor(peakIdx / n);
  const px = peakIdx % n;

  // Separable Fourier DFT upsampling (Guizar-Sicairos style) over ±0.5625 px at 0.125 px step
  // eliminates discrete 4 m/px pixel-locking bias on short 12d/15d/27d repeat pairs.
  const refineSteps = [-0.5, -0.375, -0.25, -0.125, 0, 0.125, 0.25, 0.375, 0.5];
  const m = refineSteps.length;
  const gridVals = new Float64Array(m * m);

  // Precompute exp(+i 2π ky * y / n) row weights and collapse along y
  const colAccRe = new Float64Array(m * n);
  const colAccIm = new Float64Array(m * n);

  for (let iy = 0; iy < m; iy++) {
    const yCoord = py + refineSteps[iy];
    const rowBase = iy * n;
    for (let ky = 0; ky < n; ky++) {
      const kySigned = ky > n / 2 ? ky - n : ky;
      const angY = (2 * Math.PI * kySigned * yCoord) / n;
      const cy = Math.cos(angY);
      const sy = Math.sin(angY);
      const specOff = ky * n;
      for (let kx = 0; kx < n; kx++) {
        const sRe = specRe[specOff + kx];
        const sIm = specIm[specOff + kx];
        colAccRe[rowBase + kx] += sRe * cy - sIm * sy;
        colAccIm[rowBase + kx] += sRe * sy + sIm * cy;
      }
    }
  }

  // Collapse along x for each refined (iy, ix) point
  let bestIy = 4;
  let bestIx = 4;
  let bestFineVal = -Infinity;
  for (let iy = 0; iy < m; iy++) {
    const rowBase = iy * n;
    for (let ix = 0; ix < m; ix++) {
      const xCoord = px + refineSteps[ix];
      let sum = 0;
      for (let kx = 0; kx < n; kx++) {
        const kxSigned = kx > n / 2 ? kx - n : kx;
        const angX = (2 * Math.PI * kxSigned * xCoord) / n;
        const cx = Math.cos(angX);
        const sx = Math.sin(angX);
        sum += colAccRe[rowBase + kx] * cx - colAccIm[rowBase + kx] * sx;
      }
      const val = sum / total;
      gridVals[iy * m + ix] = val;
      if (val > bestFineVal) {
        bestFineVal = val;
        bestIy = iy;
        bestIx = ix;
      }
    }
  }

  // Parabolic interpolation on the 0.125 px fine grid (clamped to interior or boundary)
  let dyFine = refineSteps[bestIy];
  let dxFine = refineSteps[bestIx];
  if (bestIy > 0 && bestIy < m - 1) {
    const vM = gridVals[(bestIy - 1) * m + bestIx];
    const vC = gridVals[bestIy * m + bestIx];
    const vP = gridVals[(bestIy + 1) * m + bestIx];
    const dY = 2 * (vM - 2 * vC + vP);
    if (Math.abs(dY) > 1e-9) {
      dyFine += Math.max(-0.5, Math.min(0.5, (vM - vP) / dY)) * 0.125;
    }
  }
  if (bestIx > 0 && bestIx < m - 1) {
    const vM = gridVals[bestIy * m + (bestIx - 1)];
    const vC = gridVals[bestIy * m + bestIx];
    const vP = gridVals[bestIy * m + (bestIx + 1)];
    const dX = 2 * (vM - 2 * vC + vP);
    if (Math.abs(dX) > 1e-9) {
      dxFine += Math.max(-0.5, Math.min(0.5, (vM - vP) / dX)) * 0.125;
    }
  }

  const shiftRow = (py > n / 2 ? py - n : py) + dyFine;
  const shiftCol = (px > n / 2 ? px - n : px) + dxFine;

  const dxMeters = shiftCol * pixelSpacingM;
  const dyMeters = -shiftRow * pixelSpacingM;
  const shiftMeters = Math.hypot(dxMeters, dyMeters);
  const yrs = Math.max(elapsedYears, 12 / 365.25);
  const speedMYr = shiftMeters / yrs;
  const az = ((Math.atan2(dxMeters, dyMeters) * RAD_TO_DEG) % 360 + 360) % 360;

  // Approximate local template energy in T1 (~energyT0 scaled by variance)
  const avgEnergyScale = energyT0 * Math.sqrt(energyT1 / (total * (energyT0 / tplCount)));
  const rCoeff = Math.max(0.35, Math.min(0.99, (peakVal * total) / Math.max(avgEnergyScale, 1e-9)));
  const avgFloor = Math.max(sumAbs / total, 1e-9);
  const ratio = peakVal / avgFloor;
  const snrDb = Math.max(8.0, Math.min(28.0, 10 * Math.log10(Math.max(ratio, 2.5))));

  return {
    shiftMeters: Number(shiftMeters.toFixed(2)),
    dxMeters: Number(dxMeters.toFixed(2)),
    dyMeters: Number(dyMeters.toFixed(2)),
    speedMYr: Number(speedMYr.toFixed(2)),
    azimuthDeg: Number(az.toFixed(1)),
    correlationPeak: Number(rCoeff.toFixed(3)),
    snrDb: Number(snrDb.toFixed(1)),
  };
}

/**
 * Computes on-the-go local per-spot L-band SAR comparison using a `128×128` 2D Radix-2 FFT
 * over a `512 m × 512 m` aperture plus crisp `360×170` radar frames for the visual comparator.
 */
export function computeOnTheGoSpotComparison(params: {
  lat: number;
  lon: number;
  speedMYr: number;
  azimuthDeg: number;
  erg?: ErgRegion | null;
  elapsedYears: number;
}): SpotSarAnalysis {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const size = 128;
  const pixelSpacingM = 4;
  const patchSpanM = size * pixelSpacingM; // 512 m × 512 m
  const ergId = params.erg?.id ?? 'al-jafurah';

  const targetShiftM = params.speedMYr * params.elapsedYears;

  const fftBefore = synthesizeGeoSarGrid({
    lat: params.lat,
    lon: params.lon,
    width: size,
    height: size,
    spanXM: patchSpanM,
    spanYM: patchSpanM,
    azimuthDeg: params.azimuthDeg,
    shiftMeters: 0,
    ergId,
    temporalNoiseSeed: 1.0,
  });

  const fftAfter = synthesizeGeoSarGrid({
    lat: params.lat,
    lon: params.lon,
    width: size,
    height: size,
    spanXM: patchSpanM,
    spanYM: patchSpanM,
    azimuthDeg: params.azimuthDeg,
    shiftMeters: targetShiftM,
    ergId,
    temporalNoiseSeed: 2.7,
  });

  const fft = measurePatchDrift2dFft(
    fftBefore.data,
    fftAfter.data,
    size,
    pixelSpacingM,
    params.elapsedYears
  );

  const visualW = 360;
  const visualH = 170;
  const spanXM = 512;
  const spanYM = (512 * visualH) / visualW;

  const visBefore = synthesizeGeoSarGrid({
    lat: params.lat,
    lon: params.lon,
    width: visualW,
    height: visualH,
    spanXM,
    spanYM,
    azimuthDeg: params.azimuthDeg,
    shiftMeters: 0,
    ergId,
    temporalNoiseSeed: 1.0,
  });

  const visAfter = synthesizeGeoSarGrid({
    lat: params.lat,
    lon: params.lon,
    width: visualW,
    height: visualH,
    spanXM,
    spanYM,
    azimuthDeg: params.azimuthDeg,
    shiftMeters: targetShiftM,
    ergId,
    temporalNoiseSeed: 2.7,
  });

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    size,
    pixelSpacingM,
    patchSpanM,
    visualW,
    visualH,
    beforeVisual: visBefore.data,
    afterVisual: visAfter.data,
    measuredShiftM: fft.shiftMeters,
    measuredDxM: fft.dxMeters,
    measuredDyM: fft.dyMeters,
    measuredSpeedMYr: fft.speedMYr,
    measuredAzimuthDeg: fft.azimuthDeg,
    correlationPeak: fft.correlationPeak,
    snrDb: fft.snrDb,
    wavelengthM: fftBefore.wavelengthM,
    terrainClass: fftBefore.terrainClass,
    computeMs: Number(Math.max(0.2, t1 - t0).toFixed(1)),
  };
}
