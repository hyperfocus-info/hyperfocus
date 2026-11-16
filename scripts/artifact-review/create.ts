import { resolve } from 'node:path';
import { createArtifactManifestFile } from '@hyperfocus/artifact-review/create';
export { createArtifactManifest, createArtifactManifestFile } from '@hyperfocus/artifact-review/create';

if (import.meta.main) {
  const [inputPath, outputPath] = Bun.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error('Usage: bun scripts/artifact-review/create.ts <input.json> <manifest.json>');
  const manifest = await createArtifactManifestFile({ inputPath, outputPath });console.log(JSON.stringify({ manifest: resolve(outputPath), items: manifest.items.length }));
}
