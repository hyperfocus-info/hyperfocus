import { expect, test } from "bun:test";
import { runnerFixture } from "./runner-test-fixture";
import { swarmHandoff } from "../reasoning/model-turn";
import { readCommandEvidence } from "./command-evidence";

test("durable handoff retains passed preparation and older executed checks after conversational output is omitted", async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const baseline = fixture.claim(); if (!baseline) throw Error("Baseline not scheduled.");
    const workspace = await fixture.context.workspace(fixture.run, baseline, signal);
    await fixture.context.execute(fixture.run, baseline, workspace, "verify-fixture", signal);
    fixture.finish(baseline);
    const task = fixture.claim("implementer", ["reasoning"]); if (!task) throw Error("Implementer not scheduled.");
    const fork = await fixture.context.fork(fixture.run, task, signal);
    for (let index = 0; index < 6; index++) await fixture.context.execute(fixture.run, task, fork, `inspect-file-${index}`, signal);
    const handoff = JSON.parse(swarmHandoff(fixture.context, fixture.run, task));
    expect(handoff.verifiedBaseline.dependencyPreparationPassed).toBe(true);
    expect(handoff.verifiedBaseline.trustedCorrectnessPassed).toBe(true);
    expect(handoff.verifiedBaseline.commandCount).toBe(2);
    expect(handoff.verifiedBaseline.artifacts).toHaveLength(2);
    expect(handoff.executedCommands).toHaveLength(3);
    expect(handoff.olderCommandReceipts).toBe(3);expect(handoff.commandArtifactIds).toHaveLength(6);
    expect(handoff.executedCommands.every((receipt:{exitCode:number})=>receipt.exitCode===0)).toBe(true);
    const recovered = await fixture.context.readArtifact(fixture.run, task, { artifactId: handoff.commandArtifactIds[0] }, signal);
    expect(recovered.text).toContain("inspect-file-0");
    expect(recovered.text).toContain("fixture command finished");
    expect(handoff.verifiedBaseline.interpretation).toContain("Reuse");
  } finally { await fixture.close(); }
});

test("artifact reads page only owned command logs or baseline evidence and reject other candidate work", async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const baseline = fixture.claim(); if (!baseline) throw Error("Baseline not scheduled.");
    const baselineLog = await fixture.context.artifact(fixture.run, baseline, { name: "command-baseline.log", kind: "log", bytes: "verified baseline" });
    fixture.finish(baseline);
    const task = fixture.claim("first", ["reasoning"]), other = fixture.claim("second", ["reasoning"]);
    if (!task || !other) throw Error("Independent workers not scheduled.");
    const ownLog = await fixture.context.artifact(fixture.run, task, { name: "command-owned.log", kind: "log", bytes: "0123456789" });
    const otherLog = await fixture.context.artifact(fixture.run, other, { name: "command-other.log", kind: "log", bytes: "another implementation" });
    const patch = await fixture.context.artifact(fixture.run, task, { name: "candidate.patch", kind: "patch", bytes: "private patch" });
    const page = await fixture.context.readArtifact(fixture.run, task, { artifactId: ownLog.id, offset: 2, maxCharacters: 3 }, signal);
    expect(page.text).toBe("234"); expect(page.nextOffset).toBe(5); expect(page.truncated).toBe(true);
    expect((await fixture.context.readArtifact(fixture.run, task, { artifactId: baselineLog.id }, signal)).text).toBe("verified baseline");
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: otherLog.id }, signal)).rejects.toThrow("private");
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: patch.id }, signal)).rejects.toThrow("private");
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: ownLog.id, maxCharacters: 8_001 }, signal)).rejects.toThrow();
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: ownLog.id, offset: 11 }, signal)).rejects.toThrow("offset");
    const large = await fixture.context.artifact(fixture.run, task, { name: "command-large.log", kind: "log", bytes: new Uint8Array(262_145) });
    await expect(fixture.context.readArtifact(fixture.run, task, { artifactId: large.id }, signal)).rejects.toThrow("limit");
  } finally { await fixture.close(); }
});

test("a provider failure retains an attributable failed execution receipt rather than an invented successful check", async () => {
  const fixture = await runnerFixture(), signal = new AbortController().signal;
  try {
    const task = fixture.claim(); if (!task) throw Error("Task not scheduled.");
    const workspace = await fixture.context.workspace(fixture.run, task, signal);
    fixture.provider.execute = async input => { input.onOutput?.({ stream: "stderr", text: "connection interrupted" }); throw Error("provider failed"); };
    await expect(fixture.context.execute(fixture.run, task, workspace, "verify-fixture", signal)).rejects.toThrow("provider failed");
    const receipt = fixture.store.get(fixture.run.id)!.messages.map(readCommandEvidence).filter(value => value !== undefined).at(-1);
    expect(receipt?.status).toBe("failed"); expect(receipt?.exitCode).toBeNull(); expect(receipt?.category).toBe("correctness");
    if (!receipt) throw Error("Failure receipt missing.");
    expect((await fixture.context.readArtifact(fixture.run, task, { artifactId: receipt.artifactId }, signal)).text).toContain("connection interrupted");
    expect(JSON.parse(swarmHandoff(fixture.context, fixture.run, task)).verifiedBaseline.trustedCorrectnessPassed).toBe(false);
  } finally { await fixture.close(); }
});
