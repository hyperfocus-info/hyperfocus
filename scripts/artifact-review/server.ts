import path from 'node:path';
import { createArtifactReviewServer as createServer } from '@hyperfocus/artifact-review/server';

/** Preserve the repository CLI's existing shared review UI and factory default. */
export function createArtifactReviewServer(options: Omit<Parameters<typeof createServer>[0], 'publicDirectory'> & { publicDirectory?: string }) {
  return createServer({ ...options, publicDirectory: options.publicDirectory ?? path.join(import.meta.dir, 'public') });
}

if (import.meta.main) {
  const host = await createArtifactReviewServer({ manifestPath: process.env.ARTIFACT_REVIEW_MANIFEST ?? path.resolve('.local/marketing-launch/v3/manifest.json'), databasePath: process.env.ARTIFACT_REVIEW_DATABASE, hostname: process.env.ARTIFACT_REVIEW_HOST ?? '127.0.0.1', port: Number(process.env.ARTIFACT_REVIEW_PORT ?? 4318) });
  console.log('Artifact review ready at ' + host.server.url);
  const stop = () => { host.close();process.exit(0); };process.on('SIGTERM', stop);process.on('SIGINT', stop);
}
