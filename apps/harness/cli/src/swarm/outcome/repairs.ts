import { z } from "zod";
import { executionResultSchema, type SwarmRun, type SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { validateSwarmPatch } from "../execution/patch-policy";

const validationSchema = z.object({ passed: z.literal(false), checks: z.array(executionResultSchema.extend({ command: z.string() })).min(1),
  artifactIds: z.array(z.string()).max(32).default([]), missing: z.array(z.string().max(1000)).max(32).default([]), verifierChanges: z.array(z.string()).default([]) }).strict();
function excerpt(text: string) { return text.length <= 1_200 ? text : `${text.slice(0, 800)}\n[excerpt omitted; retrieve validation artifact]\n${text.slice(-400)}`; }

export async function prepareSwarmRepair(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask) {
  const current = context.store.get(run.id)!, candidate = current.candidates.find(candidate => candidate.id === task.candidateId)!;
  if (candidate.correctness !== "failed" || !candidate.patchArtifactId || !candidate.validationArtifactIds.length) {
    context.change(run, task, latest => {
      for (const remaining of latest.tasks.filter(value => value.candidateId === candidate.id && value.status === "PENDING" && ["repair", "validate"].includes(value.kind))) { remaining.status = "SUCCEEDED"; remaining.completedAt = Date.now(); remaining.title += " (not needed)"; }
    });
    context.message(run, task, "No measured correctness defect requires a repair; remaining repair work was skipped.", "validation");
    return false;
  }
  const patch = new TextDecoder().decode(await context.patch(run, candidate.id));
  const policy = validateSwarmPatch({ ...context.recipe(run), text: patch });
  const evidence = current.artifacts.find(artifact => artifact.id === candidate.validationArtifactIds.at(-1));
  if (!evidence || evidence.kind !== "validation" || evidence.sourceRevision !== run.request.repository.revision
    || !current.tasks.some(value => value.id === evidence.taskId && value.agentId === evidence.agentId && value.kind === "validate" && value.candidateId === candidate.id)) {
    throw Error("Repair requires attributable validation evidence for this candidate.");
  }
  const validation = validationSchema.parse(JSON.parse(new TextDecoder().decode(await context.artifacts.read({ sha256: evidence.sha256 }))));
  const failed = validation.checks.filter(check => check.exitCode !== 0 || check.timedOut || check.truncated);
  if (!failed.length && !validation.missing.length) throw Error("Repair validation does not identify a failed correctness command or missing evidence.");
  const defect = [`${failed.length} failed correctness command(s). Full validation artifact: ${evidence.id}.`, ...failed.map(check =>
    `${check.command.slice(0, 300)}\nexitCode=${check.exitCode}; timedOut=${check.timedOut}; outputTruncated=${check.truncated}\nstdout:\n${excerpt(check.stdout)}\nstderr:\n${excerpt(check.stderr)}`),
    ...validation.missing.map(detail => `Required evidence missing: ${detail}`)].join("\n\n").slice(0, 4_000);
  const prior = current.tasks.filter(value => value.candidateId === candidate.id && value.kind === "repair" && value.repair).length;
  context.change(run, task, latest => {
    latest.tasks.find(value => value.id === task.id)!.repair = {
      round: prior + 1, defect, expectedCause: "Awaiting an explicit causal diagnosis before editing.", allowedFiles: policy.files.filter(file => !policy.addedTests.includes(file)),
      protectedInvariants: [context.recipe(run).executionKind === 'engineering' ? "Preserve baseline behavior; verification changes remain proposals requiring host review and a new immutable verifier baseline." : "Preserve all baseline behavior and existing test assertions.", "Preserve added candidate regression tests exactly.", ...latest.outcome?.knowledge.filter(finding => finding.kind === "invariant").map(finding => finding.claim.slice(0, 1_000)) ?? []].slice(0, 20),
      requiredVerification: context.recipe(run).validationCommands, priorPatchArtifactId: candidate.patchArtifactId!, validationArtifactIds: [evidence.id],
    };
    latest.candidates.find(value => value.id === candidate.id)!.disposition = "pending";
  });
  return true;
}

export async function verifySwarmRepairPatch(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask, patch: string) {
  const current = context.store.get(run.id)!, contract = current.tasks.find(value => value.id === task.id)!.repair;
  if (!contract) throw Error("Repair contract is missing.");
  const prior = current.artifacts.find(value => value.id === contract.priorPatchArtifactId)!;
  const original = new TextDecoder().decode(await context.artifacts.read({ sha256: prior.sha256 }));
  const policy = validateSwarmPatch({ ...context.recipe(run), text: original });
  const next = validateSwarmPatch({ ...context.recipe(run), text: patch });
  if (next.files.some(file => !contract.allowedFiles.includes(file) && !policy.addedTests.includes(file))) throw Error("Repair expanded beyond its allowed files.");
  const section = (text: string, file: string) => text.split(/^diff --git /m).find(value => value.startsWith(`a/${file} b/${file}\n`) || value.startsWith(`a/${file} b/${file}\r\n`));
  if (policy.addedTests.some(file => section(original, file) !== section(patch, file))) throw Error("Repair changed a protected candidate regression test.");
}
