import { expect, test } from "bun:test";
import { swarmCandidateSchema, swarmRunSchema } from "./contracts";
import { describeSwarmOutcome } from "./outcome-review";
import { canApproveSwarmCandidate } from "./review-model";

test("outcome display retains blocked results, falsification and missing evidence without inventing a verdict", () => {
  const run = swarmRunSchema.parse({
    id: "run", request: { requestId: "request", projectId: "project", goal: "Investigate allocations", repository: { revision: "a".repeat(40) } }, status: "READY", createdAt: 1, updatedAt: 1, tasks: [], candidates: [], artifacts: [], messages: [], metrics: {},
    outcome: {
      phase: "analyzed", intendedOutcome: "Reduce allocation overhead", observedSymptoms: ["Preparation is slow"], constraints: ["Exact output"], assumptions: [{ claim: "Allocations dominate", falsification: "Preparation time remains unchanged without allocations" }], acceptanceCriteria: [{ criterion: "Measure the candidate", metric: "Paired median and tails", evaluatorMethodId: "paired" }], downstreamConsequences: [],
      methods: [{ id: "paired", title: "Paired comparison", discipline: "Experimental design", method: "Alternate baseline and candidate", instruments: ["bench"], requiredEvidence: ["Raw samples"], validationCriteria: ["Stable baseline"], responsibility: "Independent evaluator", deliverable: "Qualified receipt", collaborationReason: "Separate implementation from evaluation" }],
      hypotheses: [{ candidateId: "candidate-1", claim: "Reuse reduces allocation overhead", methodId: "paired", supportingEvidenceIds: [], contradictingEvidenceIds: ["missing-receipt"], verificationCostUsd: 0.01, experiment: { instrumentId: "bench", objective: "Measure reuse", expectedInformationGain: "Locate allocation cost", expectedIfCorrect: "Lower paired times", expectedIfIncorrect: "Stable paired times", timeoutMs: 1000, maxComputeUsd: 0.01 }, status: "inconclusive" }], experiments: [], evaluations: [], knowledge: [], taskSuccess: "met", outcomeSuccess: "blocked", limitations: ["Raw samples unavailable"],
    },
  });
  run.outcome!.acceptanceCriteria.push({criterion:"Unavailable browser evidence",metric:"Exact browser images",evaluatorMethodId:null});
  const view = describeSwarmOutcome(run)!;
  expect(JSON.stringify(view)).toContain("Unavailable evaluator");
  expect(view.facts).toContainEqual({ label: "Task criteria", value: "met" });
  expect(view.facts).toContainEqual({ label: "Outcome demonstrated", value: "blocked" });
  const hypothesis = view.sections.find(section => section.id === "hypotheses")!.items[0]!;
  expect("status" in hypothesis && hypothesis.status).toBe("inconclusive");
  expect(hypothesis.facts).toContainEqual({ label: "Method", value: "Paired comparison" });
  expect(hypothesis.artifacts).toEqual([{ id: "missing-receipt", label: "missing-receipt", unavailable: true }]);
  expect(JSON.stringify(view)).toContain("Preparation time remains unchanged without allocations");
  expect(JSON.stringify(view)).toContain("Raw samples unavailable");
  expect(view.sections.find(section => section.id === "decision")!.items[0]!.facts).toContainEqual({ label: "Recorded analysis limitations", value: "Raw samples unavailable" });
  expect(describeSwarmOutcome({ ...run, outcome: undefined })).toBeUndefined();
  const candidate = swarmCandidateSchema.parse({ id: "candidate-1", agentId: "worker", hypothesis: "Reuse allocations", sourceRevision: run.request.repository.revision, correctness: "passed", patchArtifactId: "patch", disposition: "recommended", comparison: { decision: "IMPROVED", reasons: ["Qualified result"] } });
  run.status = "AWAITING_APPROVAL";
  expect(canApproveSwarmCandidate(run, candidate)).toBe(false);
  run.outcome!.outcomeSuccess = "demonstrated";
  expect(canApproveSwarmCandidate(run, candidate)).toBe(true);
});
