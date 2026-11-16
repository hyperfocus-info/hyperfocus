import { swarmOutcomeSchema, type CreateSwarmRequest, type SwarmExpertMethod, type SwarmInvestigationInstrument } from "@hyperfocus/ai-core/swarm";

/** Methods have executable host bindings. Unsupported disciplines are never advertised as available. */
const registry: SwarmExpertMethod[] = [
  {
    id: "cpu-profile", title: "Sample CPU stacks", discipline: "Performance analysis",
    method: "Sample the current workload with the runtime CPU profiler and retain the raw call tree for attribution.",
    instruments: [], requiredEvidence: ["Raw CPU profile", "Immutable source and workload identity"],
    validationCriteria: ["Profiler command completes", "Raw profile is retained before sandbox destruction", "Profiled timings are excluded from acceptance comparisons"],
    responsibility: "Attribute observed CPU work before choosing a mechanism to optimize.", deliverable: "Source-bound raw profiler artifact and its scope limitations.",
    collaborationReason: "Causal interventions and controlled comparisons need measured attribution rather than historical guesses.",
  },
  {
    id: "causal-probe", title: "Causal investigation", discipline: "Runtime systems",
    method: "Reproduce the observed mechanism and attempt cheap deterministic falsification before implementation.",
    instruments: [], requiredEvidence: ["Immutable source", "Raw instrument output", "Support and contradiction predicates declared by the trusted recipe"],
    validationCriteria: ["Successful bounded instrument execution", "Exactly one predicate matches; otherwise the result is inconclusive"],
    responsibility: "Distinguish a measured cause from an attractive explanation.", deliverable: "Reproducible supported, contradicted or inconclusive hypothesis receipt.",
    collaborationReason: "Mechanism evidence gates implementation; performance and correctness remain independent judgments.",
  },
  {
    id: "correctness-regression", title: "Independent correctness", discipline: "Software verification",
    method: "Reconstruct the exact candidate in a fresh workspace and replay protected correctness fixtures.",
    instruments: ["recipe-correctness"], requiredEvidence: ["Candidate patch and tree identity", "Trusted test command receipts"],
    validationCriteria: ["Every trusted command passes", "Source tree unchanged by validation", "Protected existing tests remain unchanged"],
    responsibility: "Reject behavior regressions independently of the implementer.", deliverable: "Attributed correctness receipt.",
    collaborationReason: "The implementing actor cannot approve its own patch.",
  },
  {
    id: "paired-performance", title: "Controlled comparison", discipline: "Experimental design",
    method: "Alternating AB/BA paired trials, replicated sessions, confidence intervals, baseline drift and tail qualification.",
    instruments: ["recipe-benchmark"], requiredEvidence: ["Raw paired distributions", "Hardware and workload identity", "Correctness-qualified source revisions"],
    validationCriteria: ["Exclusive measurement lease", "Useful effect exceeds uncertainty", "Total CPU and tail guards pass"],
    responsibility: "Distinguish improvement from environmental noise and confounding.", deliverable: "Independent comparison with explicit uncertainty and limitations.",
    collaborationReason: "A supported mechanism does not establish a useful user-facing improvement.",
  },
];

export function availableSwarmMethods(instruments: SwarmInvestigationInstrument[]) {
  const known = new Set(registry.map(method => method.id));
  if (new Set(instruments.map(instrument => instrument.id)).size !== instruments.length) throw Error("Duplicate investigation instrument identity.");
  if (instruments.some(instrument => !known.has(instrument.methodId))) throw Error("Investigation instrument refers to an unavailable expert method.");
  return registry.flatMap(method => {
    const bindings = instruments.filter(instrument => instrument.methodId === method.id);
    if (["causal-probe","cpu-profile"].includes(method.id) && !bindings.length) return [];
    return [{ ...method, instruments: [...method.instruments, ...bindings.map(instrument => instrument.id)] }];
  });
}

export function proposeSwarmOutcome(request: CreateSwarmRequest, instruments: SwarmInvestigationInstrument[]) {
  return swarmOutcomeSchema.parse({
    phase: "proposed", intendedOutcome: request.goal.slice(0, 2_000),
    observedSymptoms: [], constraints: ["Preserve the requested scope, immutable source and protected behavior.", "No separately billed inference, publication or unapproved integration.", `At most ${request.maxWorkers} workers; compute ceiling $${request.budget.maxComputeUsd}.`],
    assumptions: [{ claim: "The requested task will achieve the intended outcome.", falsification: "Independent outcome evidence remains unchanged even when task checks pass." }],
    acceptanceCriteria: request.doneCriteria.map(criterion => ({ criterion, metric: "To be qualified against current baseline evidence before implementation.", evaluatorMethodId: null })),
    downstreamConsequences: ["Higher submission frequency alone does not establish fresher displayed motion."],
    methods: availableSwarmMethods(instruments), hypotheses: [], experiments: [], evaluations: [], knowledge: [],
    taskSuccess: "pending", outcomeSuccess: "pending",
    limitations: ["This is a proposed interpretation. Baseline evidence and trusted instrument availability constrain the executable plan.", ...instruments.length ? [] : ["No trusted causal instrument is configured; outcome experiments cannot authorize an implementation."]],
  });
}
