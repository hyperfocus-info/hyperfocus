import { expect, test } from "bun:test";
import { outcomeFixture } from "./test-fixture";
import { interpretSwarmExperiment } from "./experiments";
import { swarmInvestigationInstrumentSchema } from "@hyperfocus/ai-core/swarm";

test("outcome analysis chooses one worker, tests its mechanism first and independently demonstrates the candidate", async () => {
  const fixture = await outcomeFixture();
  try {
    await fixture.coordinator.drain();
    const run = fixture.current();
    expect(run.status).toBe("AWAITING_APPROVAL");
    expect(run.outcome?.hypotheses).toHaveLength(1);
    expect(run.tasks.filter(task => task.kind === "investigate" && task.attempt > 0)).toHaveLength(1);
    expect(run.outcome?.experiments[0]?.status).toBe("supported");
    expect(fixture.calls.indexOf("probe-fixture")).toBeLessThan(fixture.calls.indexOf("produce-candidate-1"));
    expect(run.outcome?.taskSuccess).toBe("met");
    expect(run.outcome?.outcomeSuccess).toBe("demonstrated");
    expect(run.outcome?.evaluations.map(value => value.kind)).toEqual(["correctness", "performance"]);
    expect(run.outcome?.evaluations.every(value => value.evaluatorId !== run.candidates[0]!.agentId)).toBe(true);
    expect(fixture.workspaces.size).toBe(0);
    expect(fixture.coordinator.approve(run.id, "candidate-1").integration?.status).toBe("approved");
  } finally { await fixture.close(); }
});

test("contradiction and inconclusive observations spend no implementation calls or validation workspaces", async () => {
  for (const observed of [false, "missing"]) {
    const fixture = await outcomeFixture({ observed });
    try {
      await fixture.coordinator.drain(); const run = fixture.current();
      expect(run.outcome?.hypotheses[0]?.status).toBe(observed === false ? "contradicted" : "inconclusive");
      expect(run.outcome?.taskSuccess).toBe("met"); expect(run.outcome?.outcomeSuccess).toBe("unmet");
      expect(fixture.calls.some(call => call.startsWith("produce-candidate"))).toBe(false);
      expect(run.tasks.filter(task => task.kind === "investigate" || task.kind === "validate").every(task => task.attempt === 0)).toBe(true);
      expect(run.metrics.modelCalls).toBe(2);
      expect(run.outcome?.knowledge.every(finding => finding.disposition === "run-local")).toBe(true);
      expect(() => fixture.coordinator.approve(run.id, "candidate-1")).toThrow("outcome lacks independent demonstration");
      expect(fixture.workspaces.size).toBe(0);
    } finally { await fixture.close(); }
  }
});

test("one immutable probe supplies different interpretations and a protected constraint to the implementing worker", async () => {
  const fixture = await outcomeFixture({ selected: 2, constraint: true });
  try {
    await fixture.coordinator.drain(); const run = fixture.current();
    expect(fixture.calls.filter(call => call === "probe-fixture")).toHaveLength(1);
    expect(run.outcome?.experiments).toHaveLength(2);
    expect(run.outcome?.experiments[0]?.artifactIds).toEqual(run.outcome?.experiments[1]?.artifactIds);
    expect(run.candidates[1]?.blockers.join(" ")).toContain("protected constraint");
    expect(fixture.calls).not.toContain("produce-candidate-2");
    expect(fixture.prompts.some(prompt => prompt.includes("protectedFindings") && prompt.includes("invariant"))).toBe(true);
    expect(run.outcome?.knowledge.some(value => value.kind === "invariant")).toBe(true);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test("unrelated claims and failed tools cannot authorize implementation", async () => {
  for (const options of [{ malformedPlan: true }, { failProbe: true }]) {
    const fixture = await outcomeFixture(options);
    try {
      await fixture.coordinator.drain(); const run = fixture.current();
      expect(fixture.calls.some(call => call.startsWith("produce-candidate"))).toBe(false);
      expect(run.selectedCandidateId).toBeUndefined();
      expect(run.outcome?.outcomeSuccess).not.toBe("demonstrated");
      if (options.malformedPlan) {
        expect(run.metrics.modelCalls).toBe(run.tasks.find(task => task.kind === "plan")!.attempt);
        expect(run.artifacts.some(artifact => artifact.name === "blocked-review.json")).toBe(true);
      }
      expect(fixture.workspaces.size).toBe(0);
    } finally { await fixture.close(); }
  }
});

test("lost transport and failed evidence upload retain uncertainty and clean up without implementation", async () => {
  for (const failure of ["network", "artifact"]) {
    const fixture = await outcomeFixture();
    const execute = fixture.provider.execute, put = fixture.context.artifacts.put;
    fixture.provider.execute = input => input.task.command === "probe-fixture" && failure === "network" ? Promise.reject(Error("Injected connection reset")) : execute(input);
    fixture.context.artifacts.put = input => input.name.endsWith("-observation.json") && failure === "artifact" ? Promise.reject(Error("Injected durable upload failure")) : put(input);
    try {
      await fixture.coordinator.drain(); const run = fixture.current();
      expect(run.outcome?.experiments[0]?.status).toBe("inconclusive");
      expect(run.outcome?.experiments[0]?.observation).toContain("Injected");
      expect(fixture.calls.some(call => call.startsWith("produce-candidate"))).toBe(false);
      expect(run.artifacts.some(artifact => artifact.name === "baseline.json")).toBe(true);
      expect(run.selectedCandidateId).toBeUndefined(); expect(fixture.workspaces.size).toBe(0);
    } finally { await fixture.close(); }
  }
});

test("competing implementations share a supported hypothesis but retain isolated revisions and independent evaluations", async()=>{
  const fixture=await outcomeFixture({selected:2,variants:true});
  try{
    await fixture.coordinator.drain();const run=fixture.current();
    expect(fixture.calls.filter(command=>command==="probe-fixture")).toHaveLength(1);
    expect(run.candidates.slice(0,2).every(candidate=>candidate.correctness==="passed")).toBe(true);
    expect(run.candidates[0]?.sourceRevision).not.toBe(run.candidates[1]?.sourceRevision);
    expect(run.outcome?.evaluations.filter(value=>value.kind==="performance")).toHaveLength(2);
    expect(run.selectedCandidateId).toBe("candidate-1");expect(fixture.workspaces.size).toBe(0);
  }finally{await fixture.close();}
});

test("a persuasive model review cannot turn failed correctness into outcome success", async () => {
  const fixture = await outcomeFixture({ failValidation: true });
  try {
    await fixture.coordinator.drain(); const run = fixture.current();
    expect(run.completion?.status).toBe("met"); expect(run.outcome?.taskSuccess).toBe("met");
    expect(run.outcome?.outcomeSuccess).toBe("unmet");
    expect(run.outcome?.evaluations[0]?.result).toBe("failed");
    expect(fixture.calls.filter(command => command === "benchmark-fixture")).toHaveLength(1);
  } finally { await fixture.close(); }
});

test("a CPU-only recipe cannot demonstrate an unsupported display outcome through model assertions", async () => {
  const fixture = await outcomeFixture();
  try {
    fixture.store.change(fixture.run.id,run=>{run.request.doneCriteria=["Prove physical display delivery of 165 distinct gameplay frames per second."];});
    await fixture.coordinator.drain();const run=fixture.current();
    expect(run.candidates[0]?.correctness).toBe("passed");expect(run.candidates[0]?.comparison?.decision).toBe("IMPROVED");
    expect(run.completion?.status).toBe("met");expect(run.outcome?.outcomeSuccess).toBe("blocked");
    expect(run.outcome?.limitations.join(" ")).toContain("No trusted evaluator binding");
    expect(run.selectedCandidateId).toBeUndefined();
    expect(run.candidates[0]?.disposition).not.toBe("recommended");
    expect(()=>fixture.coordinator.approve(run.id,"candidate-1")).toThrow("outcome lacks independent demonstration");
  }finally{await fixture.close();}
});

test("an honest unavailable evaluator permits investigation while keeping the outcome blocked", async () => {
  const fixture = await outcomeFixture({ missingEvaluator: true });
  try {
    await fixture.coordinator.drain(); const run = fixture.current();
    expect(run.outcome?.phase).toBe("analyzed");
    expect(run.outcome?.acceptanceCriteria[0]?.evaluatorMethodId).toBeNull();
    expect(run.outcome?.experiments[0]?.status).toBe("supported");
    expect(run.outcome?.outcomeSuccess).toBe("blocked");
    expect(run.selectedCandidateId).toBeUndefined();
    expect(run.artifacts.some(artifact => artifact.name === "outcome-analysis-response-1.txt")).toBe(true);
    expect(() => fixture.coordinator.approve(run.id, "candidate-1")).toThrow("outcome lacks independent demonstration");
  } finally { await fixture.close(); }
});

test("instrument predicates require exclusive, typed observations and never coerce missing values", () => {
  const instrument = swarmInvestigationInstrumentSchema.parse({ id: "probe", methodId: "causal-probe", claim: "Measured work exists.", command: "trusted", timeoutMs: 1_000, maxComputeUsd: 0.1, lane: "investigation", supports: { path: ["value"], operator: "gt", value: 0 }, contradicts: { path: ["value"], operator: "eq", value: 0 }, limitations: [] });
  expect(interpretSwarmExperiment({ value: 1 }, instrument)).toBe("supported");
  expect(interpretSwarmExperiment({ value: 0 }, instrument)).toBe("contradicted");
  for (const value of [{ value: "1" }, {}, null, { value: Infinity }]) expect(interpretSwarmExperiment(value, instrument)).toBe("inconclusive");
  expect(interpretSwarmExperiment({ value: 1 }, { ...instrument, contradicts: instrument.supports })).toBe("inconclusive");
});

test("bounded repair retains the rejected patch and revalidates all trusted behavior in another workspace", async () => {
  const fixture = await outcomeFixture({ failValidation: true, repair: "succeed" });
  try {
    await fixture.coordinator.drain(); const run = fixture.current();
    const repair = run.tasks.find(task => task.kind === "repair" && task.attempt > 0)!;
    expect(repair.repair?.expectedCause).toContain("invalid branch");
    expect(repair.repair?.allowedFiles).toEqual(["packages/engine/src/frame/work.ts"]);
    expect(repair.repair?.requiredVerification).toEqual(["verify-fixture"]);
    expect(run.artifacts.some(artifact => artifact.id === repair.repair?.priorPatchArtifactId)).toBe(true);
    expect(run.candidates[0]?.patchArtifactId).not.toBe(repair.repair?.priorPatchArtifactId);
    expect(run.outcome?.evaluations.filter(value => value.kind === "correctness").map(value => value.result)).toEqual(["failed", "passed"]);
    expect(run.outcome?.outcomeSuccess).toBe("demonstrated");
    expect(run.tasks.filter(task => task.kind === "validate" && task.attempt > 0)).toHaveLength(2);
    expect(fixture.workspaces.size).toBe(0);
  } finally { await fixture.close(); }
});

test("failed repairs stop at the round ceiling and wrong-primitive diagnoses spend no further implementation calls", async () => {
  for (const repair of ["repeat", "wrong-primitive"] as const) {
    const fixture = await outcomeFixture({ failValidation: true, repair });
    try {
      await fixture.coordinator.drain(); const run = fixture.current();
      expect(run.tasks.filter(task => task.kind === "repair" && task.attempt > 0)).toHaveLength(1);
      expect(run.selectedCandidateId).toBeUndefined(); expect(run.outcome?.outcomeSuccess).toBe("unmet");
      expect(fixture.calls.filter(call => call.startsWith("produce-candidate"))).toHaveLength(repair === "repeat" ? 2 : 1);
      if(repair === "wrong-primitive")expect(run.candidates[0]?.blockers.join(" ")).toContain("wrong-primitive");
      expect(fixture.workspaces.size).toBe(0);
    } finally { await fixture.close(); }
  }
});
