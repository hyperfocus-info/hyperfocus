import type { createGameplay3D } from '@hyperfocus/engine/project/runtime-3d';
import { readCombatAiOutcomeReport3D } from '@hyperfocus/engine/project/runtime-3d';
import { requireText } from '@hyperfocus/utilities/text';
import { optional, readDictionary, readList, readObject, requireArray, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
export type AiObservationReport = NonNullable<ReturnType<ReturnType<typeof createGameplay3D>['aiReport']>>;
const receiptFields = {
  identity: (value: unknown) => requireText(value, { max: 256 }), session: (value: unknown) => requireText(value, { max: 128 }),
  digest: (value: unknown) => { const digest = requireText(value);if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Invalid AI evidence digest.');return digest; },
  ingestedAt: (value: unknown) => requireNumber(value, { minimum: 1, integer: true }), analysisId: (value: unknown) => requireText(value, { min: 1, max: 256 }),
};
function readAiReceipt(value: unknown) {
  return structuredClone(readObject(value, receiptFields));
}
const fighterFields = {
  id: (value: unknown) => requireText(value, { max: 128 }), type: (value: unknown) => requireOneOf(value, ['human', 'ai', 'unknown']), level: optional(value => requireNumber(value, { minimum: 1, maximum: 9, integer: true })),
  traits: optional(value => { const traits = readDictionary(value, requireNumber);if (Object.keys(traits).length > 16 || Object.keys(traits).some(key => key.length > 64)) throw Error('Invalid AI context traits.');return traits; }),
};
const contextFields = {
  mode: (value: unknown) => requireText(value, { max: 64 }), match: optional(value => requireNumber(value, { minimum: 0, integer: true })), round: optional(value => requireNumber(value, { minimum: 0, integer: true })),
  fighters: (value: unknown) => readList(requireArray(value, { maximum: 16 }), value => readObject(value, fighterFields)),
};
function readAiContext(value: unknown) {
  return structuredClone(readObject(value, contextFields));
}
export type AiHistoryEntry = ReturnType<typeof readAiHistoryEntry>;
export type AiMatchContext = ReturnType<typeof readAiContext>;
export type AiIngestionReceipt = ReturnType<typeof readAiReceipt>;

/** Complete persisted telemetry reader; report validation belongs to its engine creator. */
const entryFields = { identity: (value: unknown) => requireText(value, { max: 256 }), session: (value: unknown) => requireText(value, { max: 128 }), updated: requireNumber, report: readAiObservationReport, context: optional(readAiContext), receipt: optional(readAiReceipt) };
export function readAiHistoryEntry(value: unknown) {
  return structuredClone(readObject(value, entryFields));
}
export function readAiObservationReport(value: unknown) {
  const report = readCombatAiOutcomeReport3D(value);
  if (report.choices.length > 256 || report.outcomes.length > 256 || report.segments.length > 12
    || [report, ...report.segments].some(segment => Object.entries(segment.counts).length > 126 || Object.entries(segment.counts).some(([name, count]) => !/^AI[1-9]:(attacker|defender):(hit|block|parry|guard-break|tech|bounce|escape)$/.test(name) || !Number.isSafeInteger(count) || count < 0))) throw Error('Invalid bounded AI observation history.');
  return report;
}

/** Digest excludes storage timestamps and receipts: saving unchanged evidence keeps its receipt valid. */
export async function aiEvidenceDigest(entry: AiHistoryEntry) {
  const bytes = new TextEncoder().encode(JSON.stringify({ identity: entry.identity, session: entry.session, report: entry.report, context: entry.context ?? null }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validAiReceipt(value: unknown): value is AiIngestionReceipt {
  try { readAiReceipt(value);return true; } catch { return false; }
}
export function validAiContext(value: unknown): value is AiMatchContext {
  try { readAiContext(value);return true; } catch { return false; }
}
export async function aiEvidenceStatus(entry: AiHistoryEntry) {
  const digest = await aiEvidenceDigest(entry);
  return { ...entry, digest, ingestionStatus: entry.receipt?.digest === digest && entry.receipt.identity === entry.identity && entry.receipt.session === entry.session ? 'ingested' as const : 'pending' as const };
}
export function aiContextLines(context?: AiMatchContext) {
  if (!context) return ['Opponent type: unknown (older recording).'];
  return [`Mode: ${context.mode}. Match ${context.match ?? 'unknown'}, round ${context.round ?? 'unknown'}.`,
    ...context.fighters.map(fighter => `${fighter.id}: ${fighter.type === 'ai' ? `AI level ${fighter.level ?? 'unknown'}` : fighter.type}${fighter.traits ? `; ${Object.entries(fighter.traits).map(([key, weight]) => `${key} ${weight.toFixed(2)}`).join(', ')}` : ''}`)];
}
