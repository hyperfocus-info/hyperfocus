import { z } from "zod";
import { swarmRunSchema, swarmTaskSchema, swarmCandidateSchema, swarmArtifactSchema, swarmMessageSchema, type SwarmRun } from "./contracts";

const maximumFrameBytes = 8_000_000;
const scalars = swarmRunSchema.omit({ tasks: true, candidates: true, artifacts: true, messages: true });
function collectionSchema<T extends z.ZodTypeAny>(item: T, maximum: number) {
  return z.object({ upsert: z.array(item).max(maximum), remove: z.array(z.string()).max(maximum), order: z.array(z.string()).max(maximum).optional() }).strict();
}
const frameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), sequence: z.number().int().nonnegative(), run: swarmRunSchema }).strict(),
  z.object({ type: z.literal("delta"), sequence: z.number().int().positive(), baseSequence: z.number().int().nonnegative(), runId: z.string(),
    changes: scalars.partial(), clear: z.array(scalars.keyof()),
    tasks: collectionSchema(swarmTaskSchema, 512).optional(), candidates: collectionSchema(swarmCandidateSchema, 36).optional(),
    artifacts: collectionSchema(swarmArtifactSchema, 2_000).optional(), messages: collectionSchema(swarmMessageSchema, 2_000).optional(),
  }).strict(),
]);
export type SwarmRunFrame = z.infer<typeof frameSchema>;
export type SwarmStreamState = { run: SwarmRun; sequence: number };
type CollectionPatch<T> = { upsert: T[]; remove: string[]; order?: string[] };
function difference<T extends { id: string }>(previous: T[], next: T[]): CollectionPatch<T> | undefined {
  const before = new Map(previous.map(item => [item.id, item]));
  const after = new Map(next.map(item => [item.id, item]));
  const upsert = next.filter(item => JSON.stringify(before.get(item.id)) !== JSON.stringify(item));
  const remove = previous.filter(item => !after.has(item.id)).map(item => item.id);
  const implicitOrder = previous.filter(item => after.has(item.id)).map(item => item.id).concat(next.filter(item => !before.has(item.id)).map(item => item.id));
  const nextOrder = next.map(item => item.id);
  const order = JSON.stringify(implicitOrder) === JSON.stringify(nextOrder) ? undefined : nextOrder;
  return upsert.length || remove.length || order ? { upsert, remove, ...(order ? { order } : {}) } : undefined;
}
function applyCollection<T extends { id: string }>(previous: T[], patch?: CollectionPatch<T>): T[] {
  if (!patch) return previous;
  if (new Set(patch.upsert.map(item => item.id)).size !== patch.upsert.length || new Set(patch.remove).size !== patch.remove.length) throw Error("Duplicate swarm collection identifiers.");
  const values = new Map(previous.map(item => [item.id, item]));
  for (const id of patch.remove) { if (!values.delete(id)) throw Error("Swarm delta removes an unknown item."); }
  for (const item of patch.upsert) values.set(item.id, item);
  if (!patch.order) return [...values.values()];
  if (patch.order.length !== values.size || new Set(patch.order).size !== values.size) throw Error("Invalid swarm collection order.");
  return patch.order.map(id => { const item = values.get(id); if (!item) throw Error("Swarm delta orders an unknown item."); return item; });
}
function bounded(frame: SwarmRunFrame) {
  if (new TextEncoder().encode(JSON.stringify(frame)).byteLength > maximumFrameBytes) throw Error("Swarm update exceeds the stream limit; retrieve bounded artifacts separately.");
  return frame;
}

/** Connections begin with a snapshot. Subsequent frames carry only changed records. */
export function createSwarmRunFrame(options: { previous?: SwarmStreamState; run: SwarmRun }): SwarmRunFrame | undefined {
  const run = swarmRunSchema.parse(options.run), previous = options.previous;
  if (!previous) return bounded({ type: "snapshot", sequence: 0, run });
  if (previous.run.id !== run.id) throw Error("Swarm stream changed run identity.");
  if (JSON.stringify(previous.run) === JSON.stringify(run)) return undefined;
  const { tasks: oldTasks, candidates: oldCandidates, artifacts: oldArtifacts, messages: oldMessages, ...before } = previous.run;
  const { tasks, candidates, artifacts, messages, ...after } = run;
  const previousFields = new Map(Object.entries(before).filter(([, value]) => value !== undefined));
  const nextFields = new Map(Object.entries(after).filter(([, value]) => value !== undefined));
  const changes = Object.fromEntries([...nextFields].filter(([key, value]) => JSON.stringify(previousFields.get(key)) !== JSON.stringify(value)));
  const delta = frameSchema.parse({ type: "delta", sequence: previous.sequence + 1, baseSequence: previous.sequence, runId: run.id, changes,
    clear: [...previousFields.keys()].filter(key => !nextFields.has(key)),
    tasks: difference(oldTasks, tasks), candidates: difference(oldCandidates, candidates), artifacts: difference(oldArtifacts, artifacts), messages: difference(oldMessages, messages),
  });
  const snapshot: SwarmRunFrame = { type: "snapshot", sequence: previous.sequence + 1, run };
  return bounded(JSON.stringify(delta).length < JSON.stringify(snapshot).length ? delta : snapshot);
}

/** Reject gaps and cross-run frames; reconnecting starts with a fresh authoritative snapshot. */
export function applySwarmRunFrame(options: { previous?: SwarmStreamState; frame: unknown; runId: string }): SwarmStreamState {
  const frame = bounded(frameSchema.parse(options.frame)), previous = options.previous;
  if (frame.type === "snapshot") {
    if (frame.run.id !== options.runId || frame.sequence !== (previous ? previous.sequence + 1 : 0)) throw Error("Swarm snapshot identity or sequence mismatch.");
    for (const items of [frame.run.tasks, frame.run.candidates, frame.run.artifacts, frame.run.messages]) if (new Set(items.map(item => item.id)).size !== items.length) throw Error("Duplicate swarm snapshot identifiers.");
    return { run: frame.run, sequence: frame.sequence };
  }
  if (!previous || frame.runId !== options.runId || frame.runId !== previous.run.id || frame.baseSequence !== previous.sequence || frame.sequence !== previous.sequence + 1) throw Error("Swarm delta identity or sequence mismatch; reconnect for a fresh snapshot.");
  const fields: Record<string, unknown> = { ...previous.run, ...frame.changes };
  for (const key of frame.clear) delete fields[key];
  const run = swarmRunSchema.parse({ ...fields, tasks: applyCollection(previous.run.tasks, frame.tasks), candidates: applyCollection(previous.run.candidates, frame.candidates), artifacts: applyCollection(previous.run.artifacts, frame.artifacts), messages: applyCollection(previous.run.messages, frame.messages) });
  if (run.id !== options.runId) throw Error("Swarm delta changed run identity.");
  return { run, sequence: frame.sequence };
}
