import { z } from "zod";
import type { SwarmMessage, SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";

const prefix = "Command execution receipt: ";
export const commandEvidenceSchema = z.object({
  artifactId: z.string().min(1).max(160), commandSha256: z.string().regex(/^[a-f0-9]{64}$/),
  category: z.enum(["preparation", "correctness", "benchmark", "repository-command"]),
  status: z.enum(["returned", "failed"]), exitCode: z.number().int().nullable(),
  timedOut: z.boolean(), truncated: z.boolean(), durationMs: z.number().finite().nonnegative(),
}).strict();
export type CommandEvidence = z.infer<typeof commandEvidenceSchema>;
export function formatCommandEvidence(value: CommandEvidence) { return prefix + JSON.stringify(commandEvidenceSchema.parse(value)); }
export function readCommandEvidence(message: SwarmMessage) {
  if (message.kind !== "validation" || !message.text.startsWith(prefix)) return undefined;
  try { const parsed = commandEvidenceSchema.safeParse(JSON.parse(message.text.slice(prefix.length))); return parsed.success ? parsed.data : undefined; }
  catch { return undefined; }
}

export const artifactReadSchema = z.object({ artifactId: z.string().min(1).max(160), offset: z.number().int().nonnegative().max(262_144).default(0), maxCharacters: z.number().int().min(1).max(8_000).default(4_000) }).strict();

const accessPrefix = "Evidence access receipt: ";
const identity = { artifactId: z.string().min(1).max(160), sha256: z.string().regex(/^[a-f0-9]{64}$/) };
const captureAccessSchema = z.object({ action: z.literal("capture"), ...identity, path: z.string().min(1).max(240), bytes: z.number().int().nonnegative(), reused: z.boolean() }).strict();
const readAccessSchema = z.object({ action: z.literal("read"), ...identity, offset: z.number().int().nonnegative(), endOffset: z.number().int().nonnegative(), totalCharacters: z.number().int().nonnegative() }).strict();
const accessSchema = z.discriminatedUnion("action", [captureAccessSchema, readAccessSchema]);
export type EvidenceAccess = z.infer<typeof accessSchema>;
export function formatEvidenceAccess(value: EvidenceAccess) { return accessPrefix + JSON.stringify(accessSchema.parse(value)); }
export function readEvidenceAccess(message: SwarmMessage) {
  // Model findings cannot publish validation messages or forge trusted progress.
  if (message.kind !== "validation" || !message.text.startsWith(accessPrefix)) return undefined;
  try {
    const parsed = accessSchema.safeParse(JSON.parse(message.text.slice(accessPrefix.length)));
    if (!parsed.success) return undefined;
    const receipt = parsed.data;
    if (receipt.action === "read" && (receipt.offset > receipt.endOffset || receipt.endOffset > receipt.totalCharacters)) return undefined;
    return receipt;
  } catch { return undefined; }
}

/** Rebuild compact progress from existing durable receipts, never conversational history. */
export function swarmEvidenceProgress(run: SwarmRun, task: SwarmTask) {
  const artifacts = new Map(run.artifacts.map(artifact => [artifact.id, artifact]));
  const captures = new Map<string, z.infer<typeof captureAccessSchema> & { count: number }>();
  const reads = new Map<string, z.infer<typeof readAccessSchema> & { count: number; nextOffset: number | null }>();
  for (const message of run.messages) {
    if (message.swarmId !== run.id || message.taskId !== task.id || message.agentId !== task.agentId || message.sourceRevision !== run.request.repository.revision) continue;
    const receipt = readEvidenceAccess(message);if (!receipt) continue;
    const artifact = artifacts.get(receipt.artifactId);
    if (!artifact || artifact.swarmId !== run.id || artifact.sourceRevision !== message.sourceRevision || artifact.sha256 !== receipt.sha256) continue;
    if (receipt.action === "capture") {
      if (artifact.taskId !== task.id || artifact.agentId !== task.agentId || artifact.name !== receipt.path || artifact.bytes !== receipt.bytes) continue;
      const count = (captures.get(artifact.id)?.count ?? 0) + 1;
      captures.delete(artifact.id);captures.set(artifact.id, { ...receipt, count });
    } else {
      const key = `${artifact.id}:${receipt.offset}:${receipt.endOffset}`, count = (reads.get(key)?.count ?? 0) + 1;
      reads.delete(key);reads.set(key, { ...receipt, count, nextOffset: receipt.endOffset < receipt.totalCharacters ? receipt.endOffset : null });
    }
  }
  return { captures: [...captures.values()].slice(-16), reads: [...reads.values()].slice(-16), olderCaptures: Math.max(0, captures.size - 16), olderReads: Math.max(0, reads.size - 16) };
}
