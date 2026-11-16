import { readFile, stat } from "node:fs/promises";
import { boundFile, digestFile, fingerprint, list, loadContract, object, stages, text, type OutcomeContract } from "./contract";
import { commandPassed } from "./run";

async function inspectReceipt(root: string, file: string, contract: OutcomeContract, contractSha256: string, candidateSha256: string) {
  const receipt = object(JSON.parse(await readFile(await boundFile({ root, file }), "utf8")));
  if (receipt.schema !== "hyperfocus-outcome-receipt-v1") throw new Error("Unsupported receipt schema.");
  const criterion = contract.criteria.find(row => row.id === receipt.criterionId);
  if (!criterion) throw new Error("Receipt refers to an unknown criterion.");
  if (receipt.contractSha256 !== contractSha256 || receipt.candidateSha256 !== candidateSha256) throw new Error("Receipt has a stale contract or candidate.");
  if (receipt.kind !== criterion.evaluator.kind) throw new Error("Receipt evaluator does not match the contract.");
  const artifacts = list(receipt.artifacts);
  if (!artifacts.length) throw new Error("Raw evidence is missing.");
  const sources: string[] = [];
  for (const value of artifacts) {
    const artifact = object(value), source = await boundFile({ root, file: text(artifact.path) });
    if (await digestFile(source) !== artifact.sha256) throw new Error(`Evidence changed: ${artifact.path}`);
    sources.push(source);
  }
  let passed = false;
  if (receipt.kind === "command") {
    if (JSON.stringify(receipt.command) !== JSON.stringify(criterion.evaluator.command)) throw new Error("Receipt command differs from the frozen evaluator.");
    if (artifacts.length !== 2 || typeof receipt.durationMs !== "number" || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0 || !Number.isFinite(Date.parse(text(receipt.startedAt)))) throw new Error("Incomplete execution receipt.");
    if ((await stat(sources[0]!)).size > 8388608 || (await stat(sources[1]!)).size > 8388608) throw new Error("Command output exceeds the evidence size limit.");
    passed = receipt.error === null && commandPassed({ exitCode: typeof receipt.exitCode === "number" ? receipt.exitCode : null, stdout: await readFile(sources[0]!, "utf8"), expect: criterion.evaluator.expect });
  } else if (receipt.kind === "human") {
    text(receipt.actor); text(receipt.scope);
    if (!Number.isFinite(Date.parse(text(receipt.recordedAt)))) throw new Error("Invalid approval date.");
    passed = receipt.decision === "approved";
  }
  return { criterionId: criterion.id, kind: receipt.kind, passed, file };
}

export async function inspectOutcome({ root, file, receipts = [] }: { root: string; file: string; receipts?: readonly string[] }) {
  const { contract, sha256 } = await loadContract({ root, file });
  const candidate = await fingerprint({ root, paths: contract.candidate.paths });
  const failures: string[] = [];
  const evidence: Awaited<ReturnType<typeof inspectReceipt>>[] = [];
  for (const receipt of receipts) {
    try { evidence.push(await inspectReceipt(root, receipt, contract, sha256, candidate.sha256)); }
    catch (error) { failures.push(`${receipt}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  const criteria = contract.criteria.map(criterion => {
    const matching = evidence.filter(row => row.criterionId === criterion.id);
    // No latest-wins policy: contradictory attempts must be explicitly reconciled.
    const independent = criterion.stage === "behavior-verified" || criterion.evaluator.origin !== "self-authored";
    const passed = matching.length === 1 && matching[0]!.passed && independent && criterion.evaluator.kind !== "model";
    return { id: criterion.id, stage: criterion.stage, evaluator: criterion.evaluator.kind, passed,
      reason: matching.length > 1 ? "Conflicting or duplicate receipts; select the applicable attempt and preserve the others." : !matching.length ? "No current evidence." : !independent ? "Self-authored checks alone cannot demonstrate the outcome." : !passed ? "Evaluator failed or is advisory." : "Evidence matches the declared evaluator and candidate." };
  });
  let status: typeof stages[number] = "code-written";
  if (!failures.length) for (const stage of stages.slice(1)) {
    const required = criteria.filter(row => row.stage === stage && row.evaluator !== "model");
    if (!required.length || required.some(row => !row.passed)) break;
    status = stage;
  }
  return { schema: "hyperfocus-outcome-check-v1", status, threshold: contract.threshold,
    thresholdMet: !failures.length && stages.indexOf(status) >= stages.indexOf(contract.threshold), criteria, failures,
    contractSha256: sha256, candidate, limits: contract.limits,
    interpretation: "Checks evidence integrity and declared criteria, not evaluator adequacy, human identity, or publication authority. Review raw artifacts; receipts are local records, not attestations." };
}
