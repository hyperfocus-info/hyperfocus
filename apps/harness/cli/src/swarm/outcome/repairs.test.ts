import { expect, test } from "bun:test";
import { swarmTaskSchema } from "@hyperfocus/ai-core/swarm";
import { runnerFixture } from "../execution/runner-test-fixture";
import { swarmHandoff } from "../reasoning/model-turn";
import { outcomeFixture } from "./test-fixture";
import { prepareSwarmRepair, verifySwarmRepairPatch } from './repairs';

test('engineering repair retains existing-test proposals and accepts actual command, truncation and artifact failure receipts', async () => {
  for (const failure of ['command', 'truncated', 'artifact']) {
    const fixture = await runnerFixture({ executionKind: 'engineering', failValidation: [1], patchPath: 'packages/engine/src/frame/existing.test.ts', addedTest: true });
    try {
      await fixture.coordinator.drain();
      const run = fixture.store.get(fixture.run.id)!, candidate = run.candidates[0]!;
      expect(candidate.correctness).toBe('failed');
      const evidence = run.artifacts.find(artifact => artifact.id === candidate.validationArtifactIds.at(-1))!;
      const validation = JSON.parse(new TextDecoder().decode(await fixture.artifacts.read({ sha256: evidence.sha256 })));
      if (failure !== 'command') {
        for (const check of validation.checks) check.exitCode = 0;
        if (failure === 'truncated') validation.checks[0].truncated = true;
        else validation.missing = ['.local/report.json: required capture absent'];
        const replacement = await fixture.artifacts.put({ name: evidence.name, mediaType: evidence.mediaType, bytes: new TextEncoder().encode(JSON.stringify(validation)) });
        fixture.store.change(run.id, current => { const artifact = current.artifacts.find(artifact => artifact.id === evidence.id)!;artifact.sha256 = replacement.sha256;artifact.bytes = replacement.bytes; });
      }
      fixture.store.change(run.id, current => {
        current.status = 'RUNNING';
        current.tasks.push(swarmTaskSchema.parse({ id: 'proposal-repair', swarmId: current.id, agentId: 'proposal-worker', title: 'Repair measured proposal defect', role: 'implementer', kind: 'repair', candidateId: candidate.id,
          dependencies: [], acceptanceCriteria: [], status: 'PENDING', attempt: 0, maxAttempts: 1, capability: 'reasoning', artifactIds: [] }));
      });
      const repair = fixture.claim('repair-worker', ['reasoning']);if (!repair) throw Error('Repair not scheduled.');
      expect(await prepareSwarmRepair(fixture.context, run, repair)).toBe(true);
      const contract = fixture.store.get(run.id)!.tasks.find(task => task.id === repair.id)!.repair!;
      expect(contract.allowedFiles).toContain('packages/engine/src/frame/existing.test.ts');
      expect(contract.defect).toContain(failure === 'command' ? 'Correctness assertion failed' : failure === 'truncated' ? 'outputTruncated=true' : 'Required evidence missing: .local/report.json');
      const patch = new TextDecoder().decode(await fixture.context.patch(run, candidate.id));
      await verifySwarmRepairPatch(fixture.context, run, repair, patch);
      await expect(verifySwarmRepairPatch(fixture.context, run, repair, patch.replace('+regression', '+weakened'))).rejects.toThrow('protected candidate regression');
      expect(fixture.store.get(run.id)!.candidates[0]!.blockers.some(blocker => blocker.includes('immutable verifier baseline'))).toBe(true);
      fixture.finish(repair);
    } finally { await fixture.close(); }
  }
});

test("repair handoff retains the failed command when later successful validation produces large output", async () => {
  const fixture = await outcomeFixture({ failValidation: true, repair: "wrong-primitive" });
  try {
    fixture.context.recipes.get(fixture.run.request.projectId)!.validationCommands.push("verify-large-success");
    const execute = fixture.provider.execute;
    fixture.provider.execute = async input => {
      const result = await execute(input);
      return input.task.command === "verify-large-success" ? { ...result, stdout: "All unrelated checks passed. ".repeat(1_000) } : result;
    };
    await fixture.coordinator.drain();
    const run = fixture.current(), repair = run.tasks.find(task => task.kind === "repair" && task.repair);
    if (!repair?.repair) throw Error("Measured failure did not produce a repair contract.");
    expect(repair.repair.defect).toContain("verify-fixture");
    expect(repair.repair.defect).toContain("Correctness assertion failed");
    expect(repair.repair.defect).not.toContain("All unrelated checks passed");
    expect(repair.repair.defect.length).toBeLessThanOrEqual(4_000);
    expect(repair.repair.validationArtifactIds).toHaveLength(1);
    const artifact = run.artifacts.find(value => value.id === repair.repair!.validationArtifactIds[0]);
    expect(artifact?.kind).toBe("validation");
    expect(run.tasks.find(task => task.id === artifact?.taskId)?.candidateId).toBe(repair.candidateId);
    const handoff = JSON.parse(swarmHandoff(fixture.context, fixture.run, repair));
    expect(handoff.repair.validationArtifactIds).toEqual(repair.repair.validationArtifactIds);
    expect(fixture.prompts.some(prompt => prompt.includes("Correctness assertion failed") && prompt.includes("validationArtifactIds"))).toBe(true);
  } finally { await fixture.close(); }
});

test("repair can page its authorized validation without reading another candidate's evidence or patches", async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const validators = fixture.run.tasks.filter(task => task.kind === "validate");
    const ownValidator = validators[0]!, otherValidator = validators[1]!;
    fixture.store.change(fixture.run.id, run => {
      for (const task of run.tasks) task.status = task.id === ownValidator.id ? "PENDING" : "SUCCEEDED";
    });
    const own = fixture.claim(); if (!own) throw Error("Own validator not scheduled.");
    const validation = await fixture.context.artifact(fixture.run, own, { name: "validation.json", kind: "validation", bytes: "0123456789" });
    const patch = await fixture.context.artifact(fixture.run, own, { name: "candidate.patch", kind: "patch", bytes: "private patch" });
    fixture.finish(own);
    fixture.store.change(fixture.run.id, run => { run.tasks.find(task => task.id === otherValidator.id)!.status = "PENDING"; });
    const other = fixture.claim(); if (!other) throw Error("Other validator not scheduled.");
    const otherValidation = await fixture.context.artifact(fixture.run, other, { name: "validation.json", kind: "validation", bytes: "another candidate" });
    fixture.finish(other);
    fixture.store.change(fixture.run.id, run => {
      run.tasks.push(swarmTaskSchema.parse({ id: "repair-evidence", swarmId: run.id, agentId: "repair-worker", title: "Repair measured failure", role: "implementer", kind: "repair", candidateId: own.candidateId,
        dependencies: [], acceptanceCriteria: [], status: "PENDING", attempt: 0, maxAttempts: 1, capability: "reasoning", artifactIds: [],
        repair: { round: 1, defect: "Measured failure", expectedCause: "Missing branch", allowedFiles: [], protectedInvariants: [], requiredVerification: ["verify-fixture"], priorPatchArtifactId: patch.id,
          validationArtifactIds: [validation.id, otherValidation.id, patch.id] } }));
    });
    const repair = fixture.claim("repair-worker", ["reasoning"]); if (!repair) throw Error("Repair not scheduled.");
    const page = await fixture.context.readArtifact(fixture.run, repair, { artifactId: validation.id, offset: 2, maxCharacters: 3 }, signal);
    expect(page.text).toBe("234"); expect(page.nextOffset).toBe(5); expect(page.truncated).toBe(true);
    await expect(fixture.context.readArtifact(fixture.run, repair, { artifactId: otherValidation.id }, signal)).rejects.toThrow("private");
    await expect(fixture.context.readArtifact(fixture.run, repair, { artifactId: patch.id }, signal)).rejects.toThrow("private");
    fixture.store.change(fixture.run.id, run => { run.tasks.find(task => task.id === repair.id)!.repair!.validationArtifactIds = []; });
    await expect(fixture.context.readArtifact(fixture.run, repair, { artifactId: validation.id }, signal)).rejects.toThrow("private");
  } finally { await fixture.close(); }
});
