import type { SwarmRun, SwarmTask } from "@hyperfocus/ai-core/swarm";
import type { SwarmTaskContext } from "../execution/task-context";

/** Model completion is a task judgment; outcome demonstration additionally needs independent executable evidence. */
export async function finalizeSwarmOutcome(context: SwarmTaskContext, run: SwarmRun, task: SwarmTask, winnerId?: string) {
  const current = context.store.get(run.id)!;
  if (!current.outcome) return;
  const outcome = structuredClone(current.outcome);
  const winner = current.candidates.find(candidate => candidate.id === winnerId && candidate.disposition !== "rejected");
  outcome.taskSuccess = current.completion?.status === "met" ? "met" : "unmet";
  const correctness = outcome.evaluations.find(evaluation => evaluation.candidateId === winner?.id && evaluation.kind === "correctness" && evaluation.result === "passed");
  const performance = outcome.evaluations.find(evaluation => evaluation.candidateId === winner?.id && evaluation.kind === "performance" && evaluation.result === "passed");
  const independentlyJudged = winner && correctness && performance && correctness.evaluatorId !== winner.agentId && performance.evaluatorId !== winner.agentId && [correctness, performance].every(evaluation => evaluation.artifactIds.length && evaluation.artifactIds.every(id => current.artifacts.some(artifact => artifact.id === id)));
  const recipe = context.recipe(run);
  const uncovered = outcome.acceptanceCriteria.filter(criterion => criterion.evaluatorMethodId === null || !recipe.outcomeCriteria.some(binding => binding.criterion === criterion.criterion && binding.metric === criterion.metric && binding.evaluatorMethodId === criterion.evaluatorMethodId) || !["correctness-regression", "paired-performance"].includes(criterion.evaluatorMethodId));
  const externalBlockers = [...recipe.blockedPromotionReasons, ...uncovered.map(criterion => `No trusted evaluator binding establishes the requested criterion: ${criterion.criterion}`)];
  outcome.limitations = [...new Set([...outcome.limitations, ...externalBlockers])].slice(0, 20);
  outcome.outcomeSuccess = independentlyJudged && outcome.taskSuccess === "met" && !winner.blockers.length && !externalBlockers.length ? "demonstrated" : externalBlockers.length || outcome.phase !== "analyzed" ? "blocked" : "unmet";
  if (externalBlockers.length) outcome.knowledge.push({ kind: "missing-validator", claim: externalBlockers.join(" ").slice(0, 2_000), evidenceArtifactIds: current.artifacts.filter(artifact => artifact.name === "baseline.json").map(artifact => artifact.id), scope: current.request.projectId, disposition: "run-local", generalApplicability: "Missing acceptance evidence is a project-scoped finding; it does not establish a global rule." });
  if (independentlyJudged && performance.artifactIds.length) outcome.knowledge.push({ kind: "performance-technique", claim: `${winner.hypothesis} passed controlled comparison on the declared workload.`, evidenceArtifactIds: performance.artifactIds, scope: `${current.request.projectId}@${winner.sourceRevision}`, disposition: "run-local", generalApplicability: "Only this workload and hardware context were evaluated. Replicate before promoting a reusable technique." });
  const artifact = await context.artifact(run, task, { name: "outcome-evaluation.json", kind: "report", mediaType: "application/json", bytes: JSON.stringify(outcome) });
  context.change(run, task, latest => { latest.outcome = outcome; });
  context.message(run, task, `Task success: ${outcome.taskSuccess}. Outcome success: ${outcome.outcomeSuccess}. Findings remain scoped to this run.`, "validation", [artifact.id]);
}
