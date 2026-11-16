import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

export const stages = ["code-written", "behavior-verified", "outcome-demonstrated", "human-accepted"] as const;
const judges = ["command", "human", "model"] as const;
const origins = ["existing", "held-out", "runtime", "instrument", "self-authored"] as const;

export function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected an object.");
  return Object.fromEntries(Object.entries(input));
}
function fields(input: unknown, allowed: readonly string[]) {
  const data = object(input);
  const unknown = Object.keys(data).filter(key => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown contract fields: ${unknown.join(", ")}`);
  return data;
}
export function text(input: unknown): string {
  if (typeof input !== "string" || !input.trim()) throw new Error("Expected nonempty text.");
  return input;
}
export function list(input: unknown): unknown[] {
  if (!Array.isArray(input)) throw new Error("Expected an array.");
  return input;
}
function choice<T extends string>(input: unknown, choices: readonly T[]): T {
  const selected = choices.find(value => value === input);
  if (!selected) throw new Error(`Expected one of: ${choices.join(", ")}.`);
  return selected;
}
export function digest(input: string | Uint8Array) { return createHash("sha256").update(input).digest("hex"); }
export async function digestFile(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** The contract lives in an existing task; this module owns no task database. */
export function parseContract(input: unknown) {
  const data = fields(input, ["schema", "requested", "outcome", "next", "scope", "constraints", "evidenceAvailable", "limits", "assumptions", "candidate", "criteria", "threshold"]);
  if (data.schema !== "hyperfocus-outcome-v1") throw new Error("Unsupported outcome schema.");
  const criteria = list(data.criteria).map(value => {
    const row = fields(value, ["id", "stage", "metric", "evaluator"]);
    const evaluator = fields(row.evaluator, ["kind", "method", "independence", "origin", "command", "expect"]);
    const id = text(row.id);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error("Criterion IDs must be lowercase kebab-case.");
    const kind = choice(evaluator.kind, judges);
    const command = kind === "command" ? list(evaluator.command).map(text) : [];
    if (kind === "command" && !command.length) throw new Error(`${id}: command must not be empty.`);
    const expect = evaluator.expect === undefined ? undefined : object(evaluator.expect);
    if (expect && (!Object.keys(expect).length || Object.values(expect).some(value => value !== null && (!["string", "boolean", "number"].includes(typeof value) || typeof value === "number" && !Number.isFinite(value))))) throw new Error("Expected JSON fields must be nonempty finite scalars.");
    const stage = choice(row.stage, stages.slice(1));
    if (stage === "human-accepted" && kind !== "human") throw new Error("Quality acceptance requires a human evaluator.");
    return { id, stage, metric: text(row.metric), evaluator: {
      kind, method: text(evaluator.method), independence: text(evaluator.independence),
      origin: kind === "command" ? choice(evaluator.origin, origins) : undefined, command, expect,
    } };
  });
  if (!criteria.length || new Set(criteria.map(row => row.id)).size !== criteria.length) throw new Error("Criteria must be nonempty with unique IDs.");
  const candidate = fields(data.candidate, ["description", "paths"]), paths = list(candidate.paths).map(text);
  if (!paths.length || new Set(paths).size !== paths.length) throw new Error("Candidate paths must be nonempty and unique.");
  const threshold = choice(data.threshold, stages.slice(1));
  const scope = list(data.scope).map(text);
  if (!scope.length) throw new Error("Declare the authorized scope.");
  for (const stage of stages.slice(1, stages.indexOf(threshold) + 1)) {
    if (!criteria.some(row => row.stage === stage && row.evaluator.kind !== "model")) throw new Error(`Missing ${stage} criterion.`);
  }
  return {
    schema: "hyperfocus-outcome-v1", requested: text(data.requested), outcome: text(data.outcome), next: text(data.next),
    scope, constraints: list(data.constraints).map(text),
    evidenceAvailable: list(data.evidenceAvailable).map(text), limits: list(data.limits).map(text),
    assumptions: list(data.assumptions).map(value => { const row = fields(value, ["claim", "disproveWith"]); return { claim: text(row.claim), disproveWith: text(row.disproveWith) }; }),
    candidate: { description: text(candidate.description), paths }, criteria, threshold,
  };
}
export type OutcomeContract = ReturnType<typeof parseContract>;

/** Resolve actual paths, including junctions, before reading local evidence. */
export async function boundFile({ root, file }: { root: string; file: string }) {
  const resolved = await boundPath({ root, file });
  if (!(await stat(resolved)).isFile()) throw new Error(`Expected a file: ${file}`);
  return resolved;
}
export async function boundPath({ root, file }: { root: string; file: string }) {
  const base = await realpath(root), resolved = await realpath(path.resolve(base, file));
  const relative = path.relative(base, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Evidence must be inside the selected root: ${file}`);
  return resolved;
}
export async function fingerprint({ root, paths }: { root: string; paths: readonly string[] }) {
  const files = await Promise.all(paths.map(async file => {
    const resolved = await boundFile({ root, file });
    return { path: path.relative(await realpath(root), resolved).replaceAll("\\", "/"), sha256: await digestFile(resolved) };
  }));
  files.sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(files.map(file => file.path)).size !== files.length) throw new Error("Candidate aliases name the same file.");
  return { files, sha256: digest(JSON.stringify(files)) };
}
export async function loadContract({ root, file }: { root: string; file: string }) {
  const data: unknown = JSON.parse((await readFile(await boundFile({ root, file }), "utf8")).replace(/^\uFEFF/, ""));
  // An existing planning document may carry the contract without duplicating the plan.
  const contract = parseContract(object(data).outcomeContract ?? data);
  return { contract, sha256: digest(JSON.stringify(contract)) };
}
