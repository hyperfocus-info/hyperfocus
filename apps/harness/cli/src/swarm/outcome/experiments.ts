import { createHash } from "node:crypto";
import { swarmExperimentReceiptSchema, type SwarmRun, type SwarmTask, type SwarmInvestigationInstrument, type ExecutionWorkspace } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";
import { swarmTaskDuration, swarmTaskComputeReservation } from "./resources";
import { swarmInstrumentIdentity, swarmProbeIdentity } from "./instrument-identity";

function matches(value: unknown, predicate: SwarmInvestigationInstrument["supports"]) {
  let selected = value;
  for (const key of predicate.path) {
    if (!selected || typeof selected !== "object" || !Object.hasOwn(selected, key)) return false;
    selected = Reflect.get(selected, key);
  }
  if (predicate.operator === "eq") return selected === predicate.value;
  if (typeof selected !== "number" || !Number.isFinite(selected) || typeof predicate.value !== "number") return false;
  switch (predicate.operator) {
    case "gt": return selected > predicate.value;
    case "gte": return selected >= predicate.value;
    case "lt": return selected < predicate.value;
    case "lte": return selected <= predicate.value;
  }
}

/** Conflicting, missing or malformed observations cannot authorize implementation. */
export function interpretSwarmExperiment(value: unknown, instrument: SwarmInvestigationInstrument) {
  const supporting = matches(value, instrument.supports), contradicting = matches(value, instrument.contradicts);
  return supporting === contradicting ? "inconclusive" : supporting ? "supported" : "contradicted";
}

export async function executeSwarmExperiment(options: { context: SwarmTaskContext; run: SwarmRun; task: SwarmTask; signal: AbortSignal }) {
  const { context, run, task, signal } = options, current = context.store.get(run.id)!;
  const hypothesis = current.outcome?.hypotheses.find(hypothesis => hypothesis.candidateId === task.candidateId);
  if (!hypothesis) throw Error("No analyzed hypothesis owns this experiment.");
  const instruments = context.recipe(run).investigationInstruments;
  const instrument = instruments.find(instrument => instrument.id === hypothesis.experiment.instrumentId);
  if (!instrument || instrument.claim !== hypothesis.claim || instrument.methodId !== hypothesis.methodId) throw Error("Experiment no longer matches its trusted instrument.");
  const instrumentSha256=swarmInstrumentIdentity(instrument),commandSha256=swarmProbeIdentity(instrument,hypothesis.experiment.timeoutMs);
  if(hypothesis.instrumentSha256!==instrumentSha256)throw Error("Trusted instrument definition changed after outcome analysis; replan before executing or reusing evidence.");
  if (current.outcome!.experiments.some(receipt => receipt.id === task.id)) return;
  const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal]);
  const deadline = setTimeout(() => controller.abort(Error("Experiment timeout exceeded.")), swarmTaskDuration(run, task));
  let workspace: ExecutionWorkspace | undefined, lease: ReturnType<SwarmTaskContext["store"]["lease"]> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const started = Date.now(), artifactIds: string[] = [], limitations = [...instrument.limitations];
  let status: "supported" | "contradicted" | "inconclusive" = "inconclusive", observation = "No complete observation was obtained.";
  try {
    context.change(run, task, latest => { latest.metrics.cacheRequests++; });
    const cached = current.outcome!.experiments.find(receipt => {
      return receipt.commandSha256 === commandSha256 && receipt.sourceRevision === run.request.repository.revision && receipt.artifactIds.length && receipt.status !== "inconclusive";
    });
    let raw: string;
    if (cached) {
      const artifact = current.artifacts.find(artifact => artifact.id === cached.artifactIds[0]);
      if (!artifact || artifact.bytes > 262_144) throw Error("Cached experiment receipt is unavailable or oversized.");
      const bytes = await context.artifacts.read({ sha256: artifact.sha256 });
      if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw Error("Cached experiment evidence failed integrity verification.");
      raw = new TextDecoder().decode(bytes); artifactIds.push(artifact.id);
      for(const id of cached.artifactIds.slice(1)){const retained=current.artifacts.find(value=>value.id===id);if(!retained)throw Error("Cached instrument attachment is missing.");const data=await context.artifacts.read({sha256:retained.sha256});if(data.length!==retained.bytes||createHash("sha256").update(data).digest("hex")!==retained.sha256)throw Error("Cached instrument attachment failed integrity verification.");artifactIds.push(id);}
      context.change(run, task, latest => { latest.metrics.cacheHits++; });
      limitations.push("Reused one source-bound raw probe; this is not an independent replication.");
    } else {
      if (swarmTaskComputeReservation(run, task) > hypothesis.experiment.maxComputeUsd) throw Error("Experiment budget cannot reserve its full bounded workspace lifetime.");
      if (instrument.lane === "benchmark") {
        lease = context.store.lease("benchmark-lane", task.id, 30_000);
        const owned = lease;
        heartbeat = setInterval(() => { try { context.store.renewLease(owned, 30_000); } catch (error) { controller.abort(error); } }, 10_000);
        workspace = await context.workspace(run, task, combined, "benchmark");
      } else workspace = await context.fork(run, task, combined);
      if (lease) context.store.assertLease(lease);
      const tree = await context.execute(run, task, workspace, `git rev-parse ${run.request.repository.revision}^{tree}`, combined);
      if (tree.exitCode !== 0 || tree.truncated || tree.timedOut || !/^[a-f0-9]{40,64}$/.test(tree.stdout.trim())) throw Error("Experiment immutable source identity is unavailable.");
      await context.verifyTree(run, task, workspace, tree.stdout.trim(), combined);
      const result = await context.execute(run, task, workspace, instrument.command, combined, hypothesis.experiment.timeoutMs);
      const artifact = await context.artifact(run, task, { name: `${task.id}-observation.json`, kind: "report", mediaType: "application/json", bytes: result.stdout });
      artifactIds.push(artifact.id);
      await context.verifyTree(run, task, workspace, tree.stdout.trim(), combined);
      if (lease) context.store.assertLease(lease);
      if (result.exitCode !== 0 || result.timedOut || result.truncated || artifact.bytes > 262_144) throw Error("Experiment execution failed or returned incomplete/oversized evidence.");
      if(instrument.artifactPaths.length){
        const files=await context.provider.captureArtifacts({workspace,paths:instrument.artifactPaths,signal:combined});
        for(const path of instrument.artifactPaths){
          const file=files.find(file=>file.name===path);if(!file||!file.bytes.length)throw Error("Trusted instrument did not retain its required raw artifact.");
          const attachment=await context.artifact(run,task,{name:path,kind:path.endsWith(".cpuprofile")?"trace":"report",mediaType:path.endsWith(".cpuprofile")?"application/json":file.mediaType,bytes:file.bytes});artifactIds.push(attachment.id);
        }
      }
      raw = result.stdout;
    }
    combined.throwIfAborted();
    status = interpretSwarmExperiment(JSON.parse(raw), instrument);
    observation = `${hypothesis.claim} — ${status}. Trusted predicates: supports ${JSON.stringify(instrument.supports)}; contradicts ${JSON.stringify(instrument.contradicts)}.`.slice(0, 2_000);
  } catch (error) {
    signal.throwIfAborted(); context.assertOwned(run, task);
    observation = `Inconclusive: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2_000);
    limitations.push("Incomplete execution cannot support or contradict the hypothesis; implementation is withheld.");
  } finally {
    clearTimeout(deadline); clearInterval(heartbeat);
    if (workspace) await context.remove(workspace);
    if (lease) context.store.releaseLease(lease);
  }
  const receipt = swarmExperimentReceiptSchema.parse({ ...hypothesis.experiment, id: task.id, candidateId: hypothesis.candidateId, methodId: hypothesis.methodId,
    requiredResources: instrument.lane === "benchmark" ? "Exclusive measurement workspace; 2 vCPU / 2 GB allocation on shared provider hardware." : "Immutable source fork; 2 vCPU / 2 GB allocation; deterministic diagnostic only.",
    status, artifactIds, observation, durationMs: Date.now() - started, sourceRevision: run.request.repository.revision, evaluatorId: `instrument:${instrument.id}`, instrumentSha256, commandSha256, limitations });
  const artifact = await context.artifact(run, task, { name: `${task.id}-experiment.json`, kind: "report", mediaType: "application/json", bytes: JSON.stringify(receipt) });
  context.change(run, task, latest => {
    const outcome = latest.outcome!, belief = outcome.hypotheses.find(value => value.candidateId === task.candidateId)!;
    outcome.experiments.push(receipt); belief.status = status;
    if (status === "supported") belief.supportingEvidenceIds.push(...artifactIds);
    if (status === "contradicted") belief.contradictingEvidenceIds.push(...artifactIds);
    if (status !== "supported" || !instrument.implementationEligible) {
      const candidate = latest.candidates.find(value => value.id === task.candidateId)!;
      candidate.disposition = "rejected";
      candidate.diagnosis = observation;
      candidate.blockers.push(instrument.implementationEligible ? `Hypothesis ${status}; no implementation calls admitted.` : instrument.purpose==="diagnostic"?"This instrument acquires diagnostic evidence; it is not an implementation direction.":"This experiment establishes a protected constraint, not an implementation direction.");
      for (const dependent of latest.tasks.filter(value => value.candidateId === candidate.id && value.id !== task.id && value.status === "PENDING")) { dependent.status = "SUCCEEDED"; dependent.completedAt = Date.now(); dependent.title += " (withheld)"; }
    }
    if (status === "contradicted" || !instrument.implementationEligible && instrument.purpose!=="diagnostic" && status === "supported") outcome.knowledge.push({ kind: status === "contradicted" ? "invalid-assumption" : "invariant", claim: observation, evidenceArtifactIds: artifactIds, scope: `${latest.request.projectId}@${latest.request.repository.revision}`, disposition: "run-local", generalApplicability: "Established only for this source and workload. Broader application requires independent replication and review." });
  });
  context.message(run, task, observation, "evidence", [...artifactIds, artifact.id]);
}
