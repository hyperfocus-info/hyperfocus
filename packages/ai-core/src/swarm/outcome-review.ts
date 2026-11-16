import type { SwarmRun } from "./contracts";

/** Framework-neutral display records shared by native and browser review hosts. */
export function describeSwarmOutcome(run: SwarmRun) {
  const outcome = run.outcome;
  if (!outcome) return undefined;
  const list = (values: readonly string[]) => values.join(" · ") || "None recorded";
  const method = (id: string) => outcome.methods.find(value => value.id === id)?.title ?? id;
  const artifactName = (id: string) => run.artifacts.find(value => value.id === id)?.name ?? `${id} (unavailable)`;
  const artifacts = (ids: readonly string[]) => [...new Set(ids)].map(id => {
    const artifact = run.artifacts.find(value => value.id === id);
    return { id, label: artifact?.name ?? id, unavailable: !artifact };
  });
  return {
    summary: outcome.intendedOutcome,
    facts: [
      { label: "Analysis", value: outcome.phase },
      { label: "Task criteria", value: outcome.taskSuccess },
      { label: "Outcome demonstrated", value: outcome.outcomeSuccess },
    ],
    sections: [
      { id: "interpretation", title: "Interpretation and acceptance", items: [
        { id: "scope", label: "Observed problem and scope", facts: [
          { label: "Symptoms", value: list(outcome.observedSymptoms) },
          { label: "Constraints", value: list(outcome.constraints) },
          { label: "Downstream consequences", value: list(outcome.downstreamConsequences) },
        ], artifacts: [] },
        ...outcome.assumptions.map((assumption, index) => ({ id: `assumption-${index}`, label: "Assumption to test", detail: assumption.claim, facts: [{ label: "Falsification", value: assumption.falsification }], artifacts: [] })),
        ...outcome.acceptanceCriteria.map((criterion, index) => ({ id: `criterion-${index}`, label: "Acceptance criterion", detail: criterion.criterion, facts: [
          { label: "Metric", value: criterion.metric },
          { label: "Evaluator method", value: criterion.evaluatorMethodId ? method(criterion.evaluatorMethodId) : "Unavailable evaluator" },
        ], artifacts: [] })),
      ] },
      { id: "methods", title: "Methods", items: outcome.methods.map(value => ({ id: value.id, label: value.title, detail: value.method, facts: [
        { label: "Discipline", value: value.discipline },
        { label: "Responsibility", value: value.responsibility },
        { label: "Instruments", value: list(value.instruments) },
        { label: "Required evidence", value: list(value.requiredEvidence) },
        { label: "Validation", value: list(value.validationCriteria) },
        { label: "Deliverable", value: value.deliverable },
        { label: "Collaboration", value: value.collaborationReason },
      ], artifacts: [] })) },
      { id: "hypotheses", title: "Hypotheses", items: outcome.hypotheses.map(value => ({ id: value.candidateId, label: value.candidateId, status: value.status, detail: value.claim, facts: [
        { label: "Method", value: method(value.methodId) },
        ...(value.implementationStrategy ? [{ label: "Candidate strategy", value: value.implementationStrategy }] : []),
        { label: "Verification cost ceiling", value: `$${value.verificationCostUsd.toFixed(2)}` },
        { label: "Supporting evidence", value: list(value.supportingEvidenceIds.map(artifactName)) },
        { label: "Contradicting evidence", value: list(value.contradictingEvidenceIds.map(artifactName)) },
        { label: "Proposed experiment", value: value.experiment.objective },
        { label: "Instrument", value: value.experiment.instrumentId },
        { label: "Expected information", value: value.experiment.expectedInformationGain },
        { label: "If correct", value: value.experiment.expectedIfCorrect },
        { label: "If incorrect", value: value.experiment.expectedIfIncorrect },
        { label: "Experiment limits", value: `${value.experiment.timeoutMs / 1_000} seconds · $${value.experiment.maxComputeUsd.toFixed(2)}` },
      ], artifacts: artifacts([...value.supportingEvidenceIds, ...value.contradictingEvidenceIds]) })) },
      { id: "experiments", title: "Experiments", items: outcome.experiments.map(value => ({ id: value.id, label: `${value.candidateId} · ${value.instrumentId}`, status: value.status, detail: value.observation, facts: [
        { label: "Objective", value: value.objective },
        { label: "Method", value: method(value.methodId) },
        { label: "Expected information", value: value.expectedInformationGain },
        { label: "If correct", value: value.expectedIfCorrect },
        { label: "If incorrect", value: value.expectedIfIncorrect },
        { label: "Resources", value: value.requiredResources },
        { label: "Duration / ceiling", value: `${value.durationMs / 1_000} / ${value.timeoutMs / 1_000} seconds` },
        { label: "Compute ceiling", value: `$${value.maxComputeUsd.toFixed(2)}` },
        { label: "Source revision", value: value.sourceRevision },
        { label: "Evaluator", value: value.evaluatorId },
        { label: "Limitations", value: list(value.limitations) },
      ], artifacts: artifacts(value.artifactIds) })) },
      { id: "evaluations", title: "Independent evaluations", items: outcome.evaluations.map((value, index) => ({ id: `${value.candidateId}-${value.kind}-${index}`, label: `${value.candidateId} · ${value.kind}`, status: value.result, detail: value.method, facts: [
        { label: "Evaluator", value: value.evaluatorId },
        { label: "Limitations", value: list(value.limitations) },
      ], artifacts: artifacts(value.artifactIds) })) },
      { id: "knowledge", title: "Learning", items: outcome.knowledge.map((value, index) => ({ id: `learning-${index}`, label: value.kind, detail: value.claim, facts: [
        { label: "Scope", value: value.scope },
        { label: "Disposition", value: value.disposition },
        { label: "General applicability", value: value.generalApplicability },
      ], artifacts: artifacts(value.evidenceArtifactIds) })) },
      { id: "decision", title: "Decision and limits", items: [{ id: "decision", label: "Current decision", detail: run.reason ?? "No final decision recorded.", facts: [
        { label: "Task criteria", value: outcome.taskSuccess },
        { label: "Outcome demonstrated", value: outcome.outcomeSuccess },
        { label: "Recorded analysis limitations", value: list(outcome.limitations) },
      ], artifacts: artifacts(outcome.artifactId ? [outcome.artifactId] : []) }] },
    ],
  };
}
