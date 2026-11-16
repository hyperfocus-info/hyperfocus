import { expect } from "bun:test";
import { createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";

export function registerReviewOwnershipTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
  serverTest("stopping during a delayed correctness review preserves the stopped run and its original plan", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const { repository, projectRoot, adapter } = fixture;
    repository.setCorrectnessIterationModeDefault("auto-once");
    await fixture.restartWithCustomOsAdapters({
      async runCorrectnessReview(_root, plan) {
        entered.resolve();
        await release.promise;
        return {
          status: "needs-iteration", summary: "Late review must not reopen stopped work.",
          gaps: [{ id: "delayed-gap", category: "plan-gap", severity: "high",
            description: "Another implementation pass is required.", suggestedFix: "Run the corrective task.",
            canParallelize: false, ownedPaths: [] }],
          recommendedPlan: { ...plan, origin: "correctness-followup", iteration: plan.iteration + 1,
            summary: "Late corrective plan", correctnessPolicy: "auto-once" }
        };
      }
    });
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot);
      const projectId = opened.payload.project.id, threadId = opened.payload.project.activeThreadId;
      const ready = await sendChatUntilReady(socket, { requestId: "delayed-review-plan", projectId, threadId,
        content: "simple task", modeId: "plan", modeLocked: true });
      const runId = ready.payload.run.id;
      socket.send(JSON.stringify({ type: "run.execute", requestId: "delayed-review-execute",
        payload: { projectId, threadId, runId } }));
      await entered.promise;
      const stopped = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === runId
        && event.payload.run.status === "stopped");
      socket.send(JSON.stringify({ type: "chat.stop", requestId: "stop-delayed-review",
        payload: { projectId, threadId, runId } }));
      await stopped;
      release.resolve();
      // Server restart drains the original command, avoiding timing-based absence
      // assertions. A late review must not persist a replacement plan even if
      // startup recovery subsequently stops an accidentally restarted execution.
      await fixture.restartWithCustomOsAdapters({ runCorrectnessReview: async () => ({
        status: "pass", summary: "No further review requested.", gaps: []
      }) });
      const persisted = repository.getRun(projectId, runId);
      expect(persisted?.status).toBe("stopped");
      expect(persisted?.plan?.iteration).toBe(ready.payload.run.plan?.iteration);
      expect(persisted?.plan?.summary).toBe(ready.payload.run.plan?.summary);
      expect(persisted?.correctnessReview).toBeUndefined();
      expect(adapter.calls.filter((call) => call.kind === "executor")).toHaveLength(1);
    } finally { release.resolve(); socket.close(); }
  }, 15000);

  serverTest("a needs-iteration review without a corrective plan fails visibly instead of completing", async () => {
    const { repository, projectRoot } = fixture;
    await fixture.restartWithCustomOsAdapters({ runCorrectnessReview: async () => ({
      status: "needs-iteration", summary: "Required behavior is missing.",
      gaps: [{ id: "missing-behavior", category: "plan-gap", severity: "high",
        description: "Required behavior is missing.", suggestedFix: "Implement the missing behavior.",
        canParallelize: false, ownedPaths: [] }]
    }) });
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot);
      const projectId = opened.payload.project.id, threadId = opened.payload.project.activeThreadId;
      const ready = await sendChatUntilReady(socket, { requestId: "missing-correction-plan", projectId, threadId,
        content: "simple task", modeId: "plan", modeLocked: true });
      const runId = ready.payload.run.id;
      const failed = waitForEvent(socket, "run.updated", (event) => event.payload.run.id === runId
        && event.payload.run.status === "failed");
      const error = waitForEvent(socket, "chat.error", (event) => event.requestId === "missing-correction-execute");
      socket.send(JSON.stringify({ type: "run.execute", requestId: "missing-correction-execute",
        payload: { projectId, threadId, runId } }));
      const [failure, visibleError] = await Promise.all([failed, error]);
      expect(failure.payload.run.failureMessage).toContain("no corrective plan");
      expect(visibleError.payload.detail).toContain("no corrective plan");
      expect(repository.getRun(projectId, runId)?.status).toBe("failed");
      expect(repository.getRun(projectId, runId)?.plan?.iteration).toBe(1);
    } finally { socket.close(); }
  }, 15000);
}
