import type { ExecutionWorkspace, SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "./task-context";
import { advanceSwarmCampaign } from "../campaign";
import { transitionSwarm } from "../persistence/store";
import { createHash } from "node:crypto";
import { formatEvidenceAccess } from "./command-evidence";
import { redactSensitiveString } from "../../tool-activity-state";

/** Retain declared evidence individually so one missing capture cannot erase the others. */
export async function captureEngineeringEvidence(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask, workspace: ExecutionWorkspace, signal: AbortSignal, paths=context.recipe(run).artifactPaths) {
  const artifactIds: string[] = [], missing: string[] = [];
  for (const path of paths) {
    try {
      signal.throwIfAborted();context.assertWorkspace(run, task, workspace);
      const files = await context.provider.captureArtifacts({ workspace, paths: [path], signal });
      signal.throwIfAborted();context.assertWorkspace(run, task, workspace);
      const file = files.find(value => value.name === path);
      if (!file?.bytes.length) throw Error("Declared evidence file is absent or empty.");
      const image = /\.(png|jpg|jpeg|webp)$/.test(path);
      const extension=path.split('.').at(-1)??'';
      const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',webm:'video/webm',mp4:'video/mp4',json:'application/json',md:'text/markdown',txt:'text/plain',html:'text/html'};
      const mediaType = types[extension]??file.mediaType;
      const sha256 = createHash("sha256").update(file.bytes).digest("hex"), kind = image ? "screenshot" : "report";
      // Capture current bytes before reuse: a repeated path can contain new evidence.
      const existing = context.store.get(run.id)!.artifacts.find(artifact => artifact.swarmId === run.id && artifact.taskId === task.id && artifact.agentId === task.agentId
        && artifact.sourceRevision === run.request.repository.revision && artifact.name === path && artifact.kind === kind && artifact.mediaType === mediaType && artifact.sha256 === sha256 && artifact.bytes === file.bytes.length);
      const artifact = existing ?? await context.artifact(run, task, { name: path, kind, mediaType, bytes: file.bytes, signal });
      context.message(run, task, formatEvidenceAccess({ action: "capture", artifactId: artifact.id, sha256: artifact.sha256, path, bytes: artifact.bytes, reused: !!existing }), "validation", [artifact.id]);
      artifactIds.push(artifact.id);
    } catch (error) {
      signal.throwIfAborted();context.assertOwned(run, task);
      missing.push(`${path}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 1000));
    }
  }
  return { artifactIds, missing };
}

/** Current defects remain inspectable and repairable; a completed baseline is not a passing baseline. */
export async function captureEngineeringBaseline(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask, workspace: ExecutionWorkspace, signal: AbortSignal) {
  const checks: BaselineCheck[] = [];
  try {
    const tree=await context.execute(run,task,workspace,`git rev-parse ${run.request.repository.revision}^{tree}`,signal);
    if(tree.exitCode!==0||tree.truncated||! /^[a-f0-9]{40,64}$/.test(tree.stdout.trim()))throw Error("Engineering baseline source identity is unavailable.");
    await context.verifyTree(run,task,workspace,tree.stdout.trim(),signal);
    for (const command of context.recipe(run).validationCommands) {
      const result = await context.execute(run, task, workspace, command, signal, run.request.budget.maxTaskDurationMs);
      checks.push({ command, exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated, passed: result.exitCode === 0 && !result.timedOut && !result.truncated });
    }
    const evidence = await captureEngineeringEvidence(context, run, task, workspace, signal);
    await context.verifyTree(run,task,workspace,tree.stdout.trim(),signal);
    const receipt = { kind: "engineering-baseline", sourceRevision: run.request.repository.revision, checks, ...evidence,
      passed: checks.every(check => check.passed) && !evidence.missing.length,
      interpretation: "Current-source verification and audit evidence; no timing comparison or human taste approval is implied." };
    const artifact = await context.artifact(run, task, { name: "baseline.json", kind: "validation", mediaType: "application/json", bytes: JSON.stringify(receipt), signal });
    context.message(run, task, JSON.stringify(receipt), "evidence", [artifact.id, ...evidence.artifactIds]);
  } catch (error) {
    await preserveInterruptedEngineeringBaseline({ context, run, task, workspace, checks, error });
    throw error;
  }
}

type BaselineCheck = { command: string; exitCode: number | null; timedOut: boolean; truncated: boolean; passed: boolean };

/** Read existing output after a command interruption; never continue validation or override its error. */
export async function preserveInterruptedEngineeringBaseline(options: {
  context: SwarmTaskContext; run: SwarmRun; task: SwarmTask; workspace: ExecutionWorkspace;
  checks: readonly BaselineCheck[]; error: unknown; timeoutMs?: number;
}) {
  const { context, run, task, workspace } = options;
  try { context.assertWorkspace(run, task, workspace); } catch { return false; }
  const controller = new AbortController(), timeoutMs = Math.max(1, Math.min(options.timeoutMs ?? 15_000, 15_000));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    const error = Error('Interrupted baseline evidence readback timed out.');controller.abort(error);reject(error);
  }, timeoutMs); });
  const artifactIds: string[] = [], missing: string[] = [];
  let nextPath = 0, captureError: string | undefined;
  const detail = (error: unknown) => redactSensitiveString(error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  try {
    const paths = context.recipe(run).artifactPaths;
    const capture = async () => {
      for (; nextPath < paths.length; nextPath++) {
        const evidence = await captureEngineeringEvidence(context, run, task, workspace, controller.signal, [paths[nextPath]!]);
        artifactIds.push(...evidence.artifactIds);missing.push(...evidence.missing);
      }
    };
    try { await Promise.race([capture(), deadline]); }
    catch (error) { captureError = detail(error);missing.push(...paths.slice(nextPath).map(path => `${path}: interrupted evidence readback incomplete.`)); }
    finally { clearTimeout(timer);controller.abort(); }
    context.assertWorkspace(run, task, workspace);
    const receipt = { kind: 'engineering-baseline', status: 'INTERRUPTED', passed: false, sourceRevision: run.request.repository.revision,
      workspaceId: workspace.id, taskId: task.id, attempt: task.attempt, leaseFence: task.leaseFence,
      checks: options.checks, artifactIds, missing, error: detail(options.error), captureError,
      interpretation: 'Partial output retained after interruption. Remaining checks and final source verification did not complete.' };
    // Reserve one bounded second to describe missing evidence even if readback expired.
    const publication = new AbortController();
    const publicationDeadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
      const error = Error('Interrupted baseline report publication timed out.');publication.abort(error);reject(error);
    }, 1_000); });
    try {
      const report = context.artifact(run, task, { name: 'baseline.json', kind: 'validation', mediaType: 'application/json', bytes: JSON.stringify(receipt), signal: publication.signal });
      const artifact = await Promise.race([report, publicationDeadline]);
      context.message(run, task, JSON.stringify(receipt), 'evidence', [artifact.id, ...artifactIds]);
      return true;
    } finally { clearTimeout(timer);publication.abort(); }
  } catch { return false; /* Cancellation/recovery and the original command error remain authoritative. */ }
  finally { clearTimeout(timer);controller.abort(); }
}

/** Generic engineering has independent correctness/review gates, never a fabricated speedup. */
export async function compareEngineeringCandidates(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask) {
  const current = context.store.get(run.id)!;
  const candidates = current.candidates.filter(candidate => candidate.correctness === "passed" && candidate.patchArtifactId
    && candidate.validationArtifactIds.length && candidate.validationArtifactIds.every(id=>current.artifacts.some(artifact=>artifact.id===id&&artifact.kind==="validation"&&artifact.agentId!==candidate.agentId&&current.tasks.some(owner=>owner.id===artifact.taskId&&owner.kind==="validate"&&owner.candidateId===candidate.id)))
    && !candidate.blockers.length && candidate.disposition !== "rejected");
  const reviewPassed = Boolean(current.modelPlan && current.completion?.status === "met" && current.completion.criteria.length===current.request.doneCriteria.length
    && current.request.doneCriteria.every(criterion=>current.completion!.criteria.some(value=>value.criterion===criterion&&value.status==="met"&&value.artifactIds.length&&value.artifactIds.every(id=>current.artifacts.some(artifact=>artifact.id===id))))
    && current.artifacts.some(artifact=>artifact.id===current.completion?.artifactId&&current.tasks.some(owner=>owner.id===artifact.taskId&&owner.kind==="review")));
  const eligible = reviewPassed ? candidates : [];
  const artifact = await context.artifact(run, task, { name: "engineering-review.json", kind: "validation", mediaType: "application/json",
    bytes: JSON.stringify({ executionKind: "engineering", reviewPassed, eligibleCandidateIds: eligible.map(candidate => candidate.id),
      validationArtifactIds: eligible.flatMap(candidate => candidate.validationArtifactIds), reviewArtifactId: current.completion?.artifactId,
      limitation: "Candidates are alternatives on the same source. Verification does not prove they can be combined, physical controller behavior, or human taste acceptance." }) });
  context.change(run, task, latest => {
    if(!reviewPassed&&latest.completion)latest.completion.status="unmet";
    for (const candidate of latest.candidates) {
      const passed = eligible.some(value => value.id === candidate.id);
      candidate.comparison = { decision: passed ? "VERIFIED" : "UNVERIFIED", reasons: [passed ? "Independent recipe verification and every explicit review criterion passed." : "Independent correctness or requested evidence remains incomplete."], artifactId: artifact.id };
      candidate.disposition = passed ? "recommended" : "rejected";
    }
    latest.selectedCandidateId = eligible[0]?.id;
    if (!advanceSwarmCampaign(latest, task, [])) transitionSwarm(latest, "AWAITING_APPROVAL", reviewPassed
      ? "Engineering evidence retained for review. Any patch integration remains a separate human decision."
      : "Requested engineering criteria remain unmet; retained evidence identifies the remaining work.");
  });
  context.message(run, task, `${eligible.length} engineering candidates independently verified. No performance comparison was requested.`, "validation", [artifact.id]);
}
