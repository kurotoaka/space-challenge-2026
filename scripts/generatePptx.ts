import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buildPresentationPptx } from '../src/utils/pptxExport';
import {
  DEFAULT_WIND_FORCING,
  evaluatePoiRisks,
  generateCalibratedDriftField,
} from '../src/utils/riskEngine';

async function main() {
  const vectors = generateCalibratedDriftField();
  const pois = evaluatePoiRisks(vectors, DEFAULT_WIND_FORCING);
  const pptx = buildPresentationPptx(pois, vectors);

  const outDir = path.resolve(process.cwd(), 'public');
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'DuneMarch_Demo.pptx');
  await pptx.writeFile({ fileName: outFile });
  console.log(`Generated ${outFile} (${pois.length} POIs, ${vectors.length} vectors)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
