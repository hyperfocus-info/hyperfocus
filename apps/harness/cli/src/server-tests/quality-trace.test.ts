import { describe, expect, test } from "bun:test";
import { qualityCoverage, qualityTraceSchema } from "@hyperfocus/ai-core/quality";
import { createQualitySession, qualityHash } from "@hyperfocus/ai-runtime/quality";
import { useServerSuiteFixture } from "./support/server-suite-fixture";
import { createSocket, openProject, sendChatUntilReady, waitForEvent } from "./support/server-test-client";

describe("quality evidence over the real task protocol", () => {
  const fixture = useServerSuiteFixture({ fixtureName: "quality-trace", persistentDatabase: true, useFastOsAdapters: true });
  test("unsupported delivery and missing UX verifiers persist through reconnect and cannot complete", async () => {
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, fixture.projectRoot), projectId = opened.payload.project.id;
      const threadId = opened.payload.project.activeThreadId;
      const ready = await sendChatUntilReady(socket, { requestId: "quality-intent", projectId, threadId, content: "Fix UI navigation and workbench recovery" });
      const finished = waitForEvent(socket, "run.updated", event => event.payload.run.id === ready.payload.run.id && event.payload.run.status === "partial-complete", 15000);
      socket.send(JSON.stringify({ type: "run.execute", requestId: "quality-execute", payload: { projectId, threadId, runId: ready.payload.run.id } }));
      const event = await finished, trace = event.payload.run.plan?.quality;
      expect(trace).toBeDefined();
      const report = qualityCoverage(trace!);
      expect(report.state).not.toBe("VERIFIED");
      expect(report.rules.some(rule => rule.loaded === "unknown")).toBe(true);
      expect(fixture.repository.getRun(projectId, ready.payload.run.id)?.plan?.quality).toEqual(trace);
      const reconnect = createSocket(fixture.port);
      try {
        await waitForEvent(reconnect, "connection.ready");
        await openProject(reconnect, fixture.projectRoot);
        expect(fixture.repository.getRun(projectId, ready.payload.run.id)?.plan?.quality).toEqual(trace);
      } finally { reconnect.close(); }
    } finally { socket.close(); }
  }, 30000);
  test("inline child retry propagates fresh obligations and invalidates the source run's passing checks", async () => {
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const projectId = (await openProject(socket, fixture.projectRoot)).payload.project.id;
      const project = fixture.repository.getProject(projectId), threadId = project.activeThreadId;
      const intent = "complex task: Fix UI navigation and workbench recovery";
      const source = (await sendChatUntilReady(socket, { requestId: "quality-retry-plan", projectId, threadId, content: intent, modeId: "plan", modeLocked: true })).payload.run;
      if (!source.plan || !source.subtasks[0]) throw new Error("Expected a delegated plan");
      const previous = createQualitySession({ runId: source.id, task: { intent } }), candidateSha256 = qualityHash("previous implementation");
      previous.select(); previous.delivery("main", "sdk-prompt", true, previous.context("main")); previous.implementation(candidateSha256, true);
      for (const verifierId of new Set(previous.trace.rules.flatMap(rule => rule.verifierIds))) previous.verify({ verifierId, candidateSha256, outcome: "passed", reason: "Previous fixture check", evidenceRefs: ["fixture:previous"] });
      expect(previous.finish().state).toBe("VERIFIED");
      fixture.repository.setAgentRunExecutionPlan(projectId, source.id, { ...source.plan, quality: previous.trace });
      for (const task of source.subtasks) {
        if (task.id === source.subtasks[0].id) fixture.repository.markSubtaskFailed(projectId, source.id, task.id, "interrupted", 1);
        else fixture.repository.markSubtaskCompleted(projectId, source.id, task.id, "Existing artifact", 1);
      }
      fixture.repository.setAgentRunStatus(projectId, source.id, "failed", "interrupted");
      const completed = waitForEvent(socket, "run.updated", event => event.payload.run.id !== source.id && event.payload.run.status === "partial-complete", 15000);
      socket.send(JSON.stringify({ type: "run.retry", requestId: "quality-retry", payload: { projectId, threadId, runId: source.id, subagentId: source.subtasks[0].id } }));
      const run = (await completed).payload.run;
      const trace = qualityTraceSchema.parse(run.plan?.quality);
      expect(trace.runId).toBe(run.id);
      expect(trace.handoffs[0]?.requiredRules.some(rule => rule.id === "ui.interaction.drawer-recovery")).toBe(true);
      expect(qualityCoverage(trace).state).not.toBe("VERIFIED");
    } finally { socket.close(); }
  }, 30000);
});
