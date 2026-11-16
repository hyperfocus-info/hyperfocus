import { asRecord as record } from "@hyperfocus/utilities/records";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { artifactManifestSchema, type ArtifactSection } from "@hyperfocus/artifact-review/schema";


/** Adapt an exported evaluator report without changing its calibration database. */
export async function createSynaestheticReview(options: {
  id: string; runId: string; title: string; audioPath: string; report: unknown;
  expectedSha256?: string; durationSeconds?: number;
}) {
  const media = resolve(options.audioPath), bytes = await Bun.file(media).arrayBuffer();
  const sha256 = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  if (options.expectedSha256 && options.expectedSha256 !== sha256) throw new Error("Evaluator audio changed since this run");
  const report = record(options.report), summary = record(report.audioSummary);
  const structure = record(record(summary.temporal).structure);
  const sections: ArtifactSection[] = [];
  const segments = Array.isArray(structure.segments) ? structure.segments : [];
  for (const [index, raw] of segments.slice(0, 200).entries()) {
    const segment = record(raw), startSeconds = segment.startSeconds, endSeconds = segment.endSeconds;
    if (typeof startSeconds !== "number" || typeof endSeconds !== "number" || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) continue;
    sections.push({ id: `segment-${index + 1}`, title: `Detected passage ${index + 1}`, startSeconds, endSeconds });
  }
  const actions = Array.isArray(report.actions) ? report.actions : [];
  for (const [index, raw] of actions.slice(0, 100).entries()) {
    const action = record(raw);
    const title = typeof action.title === "string" ? action.title : `Evaluator suggestion ${index + 1}`;
    const paragraphs = [action.observation, action.description, action.impact].filter((value): value is string => typeof value === "string");
    if (Array.isArray(action.steps)) paragraphs.push(action.steps.filter((value): value is string => typeof value === "string").map((step, position) => `${position + 1}. ${step}`).join("\n"));
    if (typeof action.verify === "string") paragraphs.push(`Check: ${action.verify}`);
    sections.push({ id: `action-${index + 1}`, title, text: [title, ...paragraphs].join("\n\n") });
  }
  if (!sections.length) sections.push({ id: "whole-piece", title: "Whole piece" });
  return artifactManifestSchema.parse({ schemaVersion: 1, id: options.id, title: options.title, items: [{
    id: "audio", title: options.title, version: options.runId, sha256, kind: "audio", media,
    durationSeconds: options.durationSeconds, sections,
    description: "Existing evaluator output. Human taste scores use 1–5 and are separate from machine scores and calibration labels.",
    dimensions: ["musicality", "groove", "structure", "soundQuality", "physicalImpact", "expression", "emotionalImpact"].map((id) => ({ id, title: id, min: 1, max: 5 })),
  }] });
}

if (import.meta.main) {
  const [inputPath, outputPath] = Bun.argv.slice(2);
  if (!inputPath || !outputPath) throw new Error("Usage: bun scripts/artifact-review/synaesthetic.ts <export.json> <manifest.json>");
  const input = record(await Bun.file(inputPath).json());
  for (const key of ["id", "runId", "title", "audioPath"]) if (typeof input[key] !== "string") throw new Error(`Missing ${key}`);
  const manifest = await createSynaestheticReview({
    id: String(input.id), runId: String(input.runId), title: String(input.title), audioPath: String(input.audioPath), report: input.report,
    ...(typeof input.expectedSha256 === "string" ? { expectedSha256: input.expectedSha256 } : {}),
    ...(typeof input.durationSeconds === "number" ? { durationSeconds: input.durationSeconds } : {}),
  });
  await Bun.write(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifest: resolve(outputPath), items: manifest.items.length, sections: manifest.items[0]?.sections.length }));
}
