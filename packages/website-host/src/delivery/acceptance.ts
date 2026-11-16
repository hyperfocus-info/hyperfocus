import { z } from 'zod';
import { digest } from './artifact';

const evidenceSchema = z.object({ passed: z.literal(true), artifactSha256: z.string().regex(/^[a-f0-9]{64}$/) });

/** Aggregates already-passing, artifact-bound reports; it does not grade taste. */
export async function createAcceptanceManifest({ artifactPath, reports }: { artifactPath: string; reports: string[] }) {
  if (!reports.length || new Set(reports).size !== reports.length) throw new Error('Provide distinct artifact-bound verification reports.');
  const artifactSha256 = digest(await Bun.file(artifactPath).bytes());
  const evidence = [];
  for (const path of reports) {
    const bytes = await Bun.file(path).bytes();
    const report = evidenceSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    if (report.artifactSha256 !== artifactSha256) throw new Error(`Evidence belongs to another artifact: ${path}`);
    evidence.push({ path, sha256: digest(bytes) });
  }
  return { schema: 'hyperfocus-artifact-verification-v1', passed: true, artifact: { path: artifactPath, sha256: artifactSha256 }, evidence, humanApproved: false, createdAt: new Date().toISOString() };
}
