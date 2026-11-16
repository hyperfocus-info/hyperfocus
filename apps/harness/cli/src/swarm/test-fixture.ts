import { Database } from "bun:sqlite";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createFileSwarmArtifactStore, createLocalExecutionProvider, swarmGit } from "@hyperfocus/ai-runtime/swarm";
import type { ExecutionProvider, SwarmOutcome, SwarmRun } from "@hyperfocus/ai-core/swarm";
import { createSwarmStore, transitionSwarm } from "./persistence/store";
import { createSwarmCoordinator } from "./coordinator";
import { createSwarmHttpHandler } from "./http";
import { createSwarmTaskContext, swarmProjectRecipeSchema } from "./execution/task-context";

function simulatedOutcome(run: SwarmRun): SwarmOutcome {
  const limitations = ["SIMULATED TEST WORKLOAD: no model, cloud or performance measurement."];
  const methodId = "fixture-content-review";
  const experiment = { instrumentId: "fixture-git-inspection", objective: "Inspect the disposable fixture candidate and preserve an attributable result.", expectedInformationGain: "Verify that the host exposes a result and its limitations.", expectedIfCorrect: "The fixture reports support and retains its validation artifact.", expectedIfIncorrect: "The fixture reports contradiction and retains its validation artifact.", timeoutMs: 10_000, maxComputeUsd: 0 };
  return {
    phase: "analyzed", intendedOutcome: "SIMULATED TEST WORKLOAD: inspect explicit outcomes in both host review dialogs.",
    observedSymptoms: ["Outcome details need an inspectable UI journey."], constraints: ["Use disposable Git data; no cloud resources or model calls."],
    assumptions: [{ claim: "A synthetic receipt can exercise the review controls.", falsification: "An evidence action cannot retrieve its retained artifact." }],
    acceptanceCriteria: [{ criterion: "Inspect the structured outcome and its evidence.", metric: "Both host review journeys reach the retained validation artifact.", evaluatorMethodId: methodId }],
    downstreamConsequences: ["UI evidence establishes host integration only."],
    methods: [{ id: methodId, title: "Disposable fixture inspection", discipline: "Software validation", method: "Inspect a deterministic candidate receipt through the real authenticated host.", instruments: [experiment.instrumentId], requiredEvidence: ["Preserved validation artifact"], validationCriteria: ["Artifact identity and content are verified by the host."], responsibility: "Fixture verifier", deliverable: "Attributable simulated receipt", collaborationReason: "Exercise the same review contract in Harness and Editor." }],
    hypotheses: run.candidates.map((candidate, index) => ({ candidateId: candidate.id, claim: `SIMULATED hypothesis ${index + 1}: a candidate receipt remains inspectable.`, methodId, supportingEvidenceIds: index === 0 ? candidate.validationArtifactIds : [], contradictingEvidenceIds: index === 1 ? candidate.validationArtifactIds : [], verificationCostUsd: 0, experiment, status: index === 0 ? "supported" : index === 1 ? "contradicted" : "inconclusive" })),
    experiments: run.candidates.map((candidate, index) => ({ ...experiment, id: `fixture-experiment-${index}`, candidateId: candidate.id, methodId, requiredResources: "Disposable local fixture only", status: index === 0 ? "supported" : index === 1 ? "contradicted" : "inconclusive", artifactIds: candidate.validationArtifactIds, observation: "SIMULATED TEST WORKLOAD: fixed result used to verify outcome presentation.", durationMs: 0, sourceRevision: run.request.repository.revision, evaluatorId: "fixture-verifier", limitations })),
    evaluations: run.candidates.map(candidate => ({ candidateId: candidate.id, kind: "correctness", evaluatorId: "fixture-verifier", method: "Inspect the retained deterministic fixture validation receipt.", artifactIds: candidate.validationArtifactIds, result: candidate.correctness === "passed" ? "passed" : "failed", limitations })),
    knowledge: [{ kind: "missing-validator", claim: "Real performance remains unmeasured by this UI fixture.", evidenceArtifactIds: [], scope: "This simulated review run", disposition: "run-local", generalApplicability: "No reusable performance conclusion is supported." }],
    taskSuccess: "met", outcomeSuccess: "demonstrated", limitations,
  };
}

/** Deterministic host/UI fixture. No model, cloud resource, or performance claim. */
export function createSwarmHttpFixture(options: { directory: string; projectIds?: string[]; verifyGitIntegration?: boolean; connectionAccess?:(input:unknown)=>unknown }) {
  const token = "simulated-swarm-fixture-only-0000000000000000";
  const db = new Database(join(options.directory, "swarm.sqlite"));
  const store = createSwarmStore({ db });
  const artifacts = createFileSwarmArtifactStore({ directory: join(options.directory, "artifacts") });
  const recipes = new Map((options.projectIds ?? ["fixture-project"]).map(id => [id, swarmProjectRecipeSchema.parse({ id, name: "SIMULATED TEST WORKLOAD", preparationCommand: "fixture", validationCommands: ["fixture"], benchmarkCommand: "fixture", ownedPaths: ["demo.txt"] })]));
  const provider: ExecutionProvider = {
    kind: "local",
    async createWorkspace() { throw new Error("Fixture does not provision execution environments."); },
    async forkWorkspace() { throw new Error("Fixture does not fork execution environments."); },
    async execute() { throw new Error("Fixture does not execute repository code."); },
    async captureArtifacts() { return []; },
    async destroyWorkspace() {},
    async listWorkspaces() { return []; },
  };
  const context = createSwarmTaskContext({ store, artifacts, provider, recipes });
  const gitProvider = createLocalExecutionProvider({ directory: join(options.directory, "git-verification") });
  const integrationVerifications: Array<{ runId: string; candidateId: string; sourceRevision: string; expectedTree: string; receivedTree: string; reconstructedTree: string; simulatedPerformance: true; cloudVerified: false }> = [];
  async function reconstructCandidate(run: SwarmRun, candidateId: string, signal: AbortSignal) {
    const workspace = await gitProvider.createWorkspace({ swarmId: run.id, taskId: `fixture-verification-${candidateId}`, source: await context.source(run), resources: { cpu: 1, memoryGB: 1 }, lane: "investigation", signal });
    try {
      signal.throwIfAborted();
      await swarmGit({ root: workspace.root, args: ["config", "core.autocrlf", "false"] });
      const patch = await context.patch(run, candidateId);
      await swarmGit({ root: workspace.root, args: ["apply", "--check", "--whitespace=error", "-"], input: patch });
      await swarmGit({ root: workspace.root, args: ["apply", "--whitespace=error", "-"], input: patch });
      if (await readFile(join(workspace.root, "demo.txt"), "utf8") !== `${candidateId}\n`) throw new Error("Tiny Git fixture correctness failed: unexpected demo contents.");
      const changed = (await swarmGit({ root: workspace.root, args: ["diff", "--name-only", "HEAD"] })).output;
      if (changed !== "demo.txt") throw new Error("Tiny Git fixture correctness failed: patch changed unrelated files.");
      await swarmGit({ root: workspace.root, args: ["add", "-A"] });
      await swarmGit({ root: workspace.root, args: ["diff", "--cached", "--check"] });
      signal.throwIfAborted();
      return (await swarmGit({ root: workspace.root, args: ["write-tree"] })).output;
    } finally { await gitProvider.destroyWorkspace({ workspaceId: workspace.id }); }
  }
  const coordinator = createSwarmCoordinator({ store, provider, handleTask: async ({ run, task, signal }) => {
    signal.throwIfAborted();
    if (task.kind === "baseline" && run.request.goal.includes("[fail]")) throw new Error("SIMULATED TEST WORKLOAD: baseline validation failed.");
    if (task.kind === "baseline" && run.request.goal.includes("[cancel]")) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 30_000);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
    }
    if (task.kind === "investigate") {
      const patch = await context.artifact(run, task, { name: `${task.candidateId}.patch`, kind: "patch", mediaType: "text/x-diff", bytes: `diff --git a/demo.txt b/demo.txt\n--- a/demo.txt\n+++ b/demo.txt\n@@ -1 +1 @@\n-baseline\n+${task.candidateId}\n` });
      store.change(run.id, latest => {
        const candidate = latest.candidates.find(value => value.id === task.candidateId)!;
        candidate.diagnosis = "SIMULATED TEST WORKLOAD: deterministic review fixture; no real optimization or benchmark was performed.";
        candidate.patchArtifactId = patch.id;
      });
      context.message(run, task, "SIMULATED TEST WORKLOAD: bounded candidate patch preserved for UI verification.", "evidence", [patch.id]);
    }
    if (task.kind === "validate") {
      const sourceTree = options.verifyGitIntegration ? await reconstructCandidate(run, task.candidateId!, signal) : undefined;
      const validation = await context.artifact(run, task, { name: `${task.candidateId}-validation.txt`, kind: "validation", bytes: `SIMULATED TEST WORKLOAD: ${task.candidateId === "candidate-2" ? "failed (deliberate fixture rejection)" : "passed"} fixture result.${sourceTree ? ` Real isolated Git patch/content verification passed; captured tree ${sourceTree}. Performance evidence remains simulated.` : ""}` });
      store.change(run.id, latest => {
        const candidate = latest.candidates.find(value => value.id === task.candidateId)!;
        candidate.correctness = task.candidateId === "candidate-2" ? "failed" : "passed";
        if (sourceTree) candidate.sourceTree = sourceTree;
        candidate.validationArtifactIds.push(validation.id);
      });
    }
    if (task.kind === "benchmark") store.change(run.id, latest => {
      for (const candidate of latest.candidates) candidate.comparison = {
        decision: candidate.id === "candidate-1" ? "IMPROVED" : candidate.id === "candidate-2" ? "CORRECTNESS FAILED" : "INCONCLUSIVE — ENVIRONMENT NOISE",
        reasons: ["SIMULATED TEST WORKLOAD: fixed fixture result. Not a measured performance result."],
      };
    });
    if (task.kind === "compare") store.change(run.id, latest => {
      latest.outcome = simulatedOutcome(latest);
      latest.candidates[0]!.disposition = "recommended";
      latest.selectedCandidateId = latest.candidates[0]!.id;
      transitionSwarm(latest, "AWAITING_APPROVAL", "SIMULATED TEST WORKLOAD: inspect these fixture candidates. Performance evidence is simulated; no cloud verification.");
    });
  } });
  const handler = createSwarmHttpHandler({ store, coordinator, artifacts, recipes, token, backend: "local",
    ...options.connectionAccess?{connections:{mint:options.connectionAccess,start:async(id:string)=>{coordinator.start(id);return store.get(id);}}}:{},
    profile: { agentId: "direct", providerId: "fixture", modelId: "fixture", approvalPolicy: "never" }, verifyIntegration: options.verifyGitIntegration ? async ({ run, candidateId, sourceTree, signal }) => {
    const candidate = run.candidates.find(value => value.id === candidateId);
    if (!candidate?.sourceTree || sourceTree !== candidate.sourceTree) throw new Error("Integrated source differs from the independently validated tiny fixture tree.");
    const reconstructedTree = await reconstructCandidate(run, candidateId, signal);
    if (reconstructedTree !== sourceTree) throw new Error("Repeated tiny Git fixture verification produced a different tree.");
    const receipt = { runId: run.id, candidateId, sourceRevision: run.request.repository.revision, expectedTree: candidate.sourceTree, receivedTree: sourceTree, reconstructedTree, simulatedPerformance: true as const, cloudVerified: false as const };
    integrationVerifications.push(receipt);
    const task = run.tasks.find(value => value.kind === "validate" && value.candidateId === candidateId)!;
    const artifact = await artifacts.put({ name: "tiny-git-integration-verification.json", mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify(receipt)) });
    const id = crypto.randomUUID();
    store.change(run.id, current => { current.artifacts.push({ name: artifact.name, mediaType: artifact.mediaType, sha256: artifact.sha256, bytes: artifact.bytes, id, swarmId: run.id, taskId: task.id, agentId: task.agentId, sourceRevision: run.request.repository.revision, kind: "validation", createdAt: Date.now() }); current.tasks.find(value => value.id === task.id)!.artifactIds.push(id); });
  } : undefined });
  return { token, store, coordinator, artifacts, recipes, handler, integrationVerifications, async verificationWorkspaceCount() { return (await gitProvider.listWorkspaces()).length; }, async close() { await coordinator.close(); for (const workspace of await gitProvider.listWorkspaces()) await gitProvider.destroyWorkspace({ workspaceId: workspace.id }); db.close(); } };
}
