import { isRecord as isObject } from "@hyperfocus/utilities/records";
/** Portable contract shared by the review host, generators, and feedback readers. */
export type ArtifactSection = { id: string; title: string; startSeconds?: number; endSeconds?: number; text?: string };
export type ArtifactDimension = { id: string; title: string; min?: number; max?: number };
export type ArtifactItem = {
  id: string; version: string | number; sha256: string; title: string; description?: string;
  kind: "video" | "audio" | "image" | "text"; media?: string; text?: string;
  durationSeconds?: number; sections: ArtifactSection[]; dimensions?: ArtifactDimension[];
  comparison?: { id: string; phase: "before" | "after" };
};
export type ArtifactManifest = { schemaVersion: 1; id: string; title: string; items: ArtifactItem[] };
export type ArtifactAnnotation = {
  id: string; sectionId?: string; startSeconds?: number; endSeconds?: number; text: string;
  rect?: { x: number; y: number; width: number; height: number };
};
export type ArtifactReview = {
  version: string | number; sha256: string; grade: "A" | "B" | "C" | "D" | "F" | null;
  scores: Record<string, number | null>; notes: string; annotations: ArtifactAnnotation[];
};


function object(value: unknown) {
  if (!isObject(value)) throw new Error("Expected an object");
  return value;
}
function string(value: unknown, limit = 20_000) {
  if (typeof value !== "string" || value.length > limit) throw new Error("Invalid text");
  return value;
}
function id(value: unknown) {
  const result = string(value, 160);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result)) throw new Error("Invalid identifier");
  return result;
}
function number(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Expected finite number");
  return value;
}
function version(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid version");
    return value;
  }
  const result = string(value, 160);
  if (!result.trim()) throw new Error("Version is required");
  return result;
}
function hash(value: unknown) {
  const result = string(value, 64);
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error("Expected lowercase SHA-256");
  return result;
}
function array(value: unknown, limit: number) {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Invalid list length");
  return value;
}
function unique(values: { id: string }[]) {
  if (new Set(values.map((value) => value.id)).size !== values.length) throw new Error("Duplicate identifier");
}
function timing(value: Record<string, unknown>) {
  const startSeconds = value.startSeconds === undefined ? undefined : number(value.startSeconds);
  const endSeconds = value.endSeconds === undefined ? undefined : number(value.endSeconds);
  if (startSeconds !== undefined && startSeconds < 0) throw new Error("Negative timestamp");
  if (endSeconds !== undefined && (startSeconds === undefined || endSeconds <= startSeconds)) throw new Error("Invalid time range");
  return { ...(startSeconds === undefined ? {} : { startSeconds }), ...(endSeconds === undefined ? {} : { endSeconds }) };
}
function section(value: unknown): ArtifactSection {
  const entry = object(value);
  return { id: id(entry.id), title: string(entry.title, 500), ...timing(entry), ...(entry.text === undefined ? {} : { text: string(entry.text) }) };
}
function dimension(value: unknown): ArtifactDimension {
  const entry = object(value), min = entry.min === undefined ? 1 : number(entry.min), max = entry.max === undefined ? 5 : number(entry.max);
  if (max <= min) throw new Error("Invalid score bounds");
  return { id: id(entry.id), title: string(entry.title, 500), min, max };
}
function item(value: unknown): ArtifactItem {
  const entry = object(value), kind = entry.kind;
  if (kind !== "video" && kind !== "audio" && kind !== "image" && kind !== "text") throw new Error("Unsupported artifact kind");
  const sections = array(entry.sections ?? [], 500).map(section), dimensions = array(entry.dimensions ?? [], 50).map(dimension);
  unique(sections); unique(dimensions);
  const media = entry.media === undefined ? undefined : string(entry.media, 4000), text = entry.text === undefined ? undefined : string(entry.text, 200_000);
  if (kind === "text" ? text === undefined : !media) throw new Error("Artifact content is required");
  const durationSeconds = entry.durationSeconds === undefined ? undefined : number(entry.durationSeconds);
  let comparison: ArtifactItem['comparison'];
  if (entry.comparison !== undefined) {
    const pair = object(entry.comparison);
    if (kind !== 'image' || pair.phase !== 'before' && pair.phase !== 'after') throw new Error('Comparison requires before/after images');
    comparison = { id: id(pair.id), phase: pair.phase };
  }
  if (durationSeconds !== undefined && durationSeconds <= 0) throw new Error("Invalid duration");
  for (const entry of sections) if (durationSeconds !== undefined && (entry.endSeconds ?? entry.startSeconds ?? 0) > durationSeconds) throw new Error("Section exceeds duration");
  return { id: id(entry.id), version: version(entry.version), sha256: hash(entry.sha256), title: string(entry.title, 500), kind, sections, dimensions,
    ...(media === undefined ? {} : { media }), ...(text === undefined ? {} : { text }), ...(comparison ? { comparison } : {}),
    ...(durationSeconds === undefined ? {} : { durationSeconds }), ...(entry.description === undefined ? {} : { description: string(entry.description) }) };
}
function annotation(value: unknown): ArtifactAnnotation {
  const entry = object(value), result: ArtifactAnnotation = { id: id(entry.id), text: string(entry.text), ...timing(entry) };
  if (!result.text.trim()) throw new Error("Annotation text is required");
  if (entry.sectionId !== undefined) result.sectionId = id(entry.sectionId);
  if (entry.rect !== undefined) {
    const rect = object(entry.rect), x = number(rect.x), y = number(rect.y), width = number(rect.width), height = number(rect.height);
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) throw new Error("Rectangle must fit normalized artifact bounds");
    result.rect = { x, y, width, height };
  }
  return result;
}
export const artifactManifestSchema = { parse(value: unknown): ArtifactManifest {
  const entry = object(value);
  if (entry.schemaVersion !== undefined && entry.schemaVersion !== 1) throw new Error("Unsupported manifest schema");
  // The current design evidence archive has 2,388 before/after captures.
  const items = array(entry.items, 3000).map(item); unique(items);
  const comparisons = new Map<string, Set<string>>();
  for (const item of items) if (item.comparison) {
    const phases = comparisons.get(item.comparison.id) ?? new Set<string>();
    if (phases.has(item.comparison.phase)) throw new Error('Duplicate comparison phase');
    phases.add(item.comparison.phase); comparisons.set(item.comparison.id, phases);
  }
  if ([...comparisons.values()].some(phases => phases.size !== 2)) throw new Error('Comparison needs both before and after');
  return { schemaVersion: 1, id: id(entry.id), title: string(entry.title, 500), items };
} };
export const artifactReviewSchema = { parse(value: unknown): ArtifactReview {
  const entry = object(value), grade = entry.grade ?? null;
  if (grade !== null && grade !== "A" && grade !== "B" && grade !== "C" && grade !== "D" && grade !== "F") throw new Error("Invalid grade");
  const scores: Record<string, number | null> = Object.create(null);
  for (const [key, value] of Object.entries(object(entry.scores ?? {}))) scores[id(key)] = value === null ? null : number(value);
  const annotations = array(entry.annotations ?? [], 500).map(annotation); unique(annotations);
  return { version: version(entry.version), sha256: hash(entry.sha256), grade, scores, notes: string(entry.notes ?? ""), annotations };
} };
export function validateArtifactReview(options: { item: ArtifactItem; review: unknown }): ArtifactReview {
  const review = artifactReviewSchema.parse(options.review), artifact = options.item;
  if (review.sha256 !== artifact.sha256 || review.version !== artifact.version) throw new Error("Review belongs to a different artifact version");
  for (const [key, value] of Object.entries(review.scores)) {
    const dimension = artifact.dimensions?.find((entry) => entry.id === key);
    if (!dimension || (value !== null && (value < (dimension.min ?? 1) || value > (dimension.max ?? 5)))) throw new Error("Unknown or out-of-range score");
  }
  for (const annotation of review.annotations) {
    if (annotation.sectionId && !artifact.sections.some((section) => section.id === annotation.sectionId)) throw new Error("Unknown section");
    if (annotation.startSeconds !== undefined && artifact.kind !== "audio" && artifact.kind !== "video") throw new Error("Timestamp requires timed media");
    if (artifact.durationSeconds !== undefined && (annotation.endSeconds ?? annotation.startSeconds ?? 0) > artifact.durationSeconds) throw new Error("Annotation exceeds duration");
    if (annotation.rect && artifact.kind !== "video" && artifact.kind !== "image") throw new Error("Spatial annotation requires visual media");
  }
  return review;
}
