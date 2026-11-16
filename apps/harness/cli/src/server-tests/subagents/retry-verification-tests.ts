import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { agentRunStateSchema } from "@hyperfocus/ai-core/protocol";
import { createSocket, openProject, sendChatUntilReady, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";

export function registerRetryVerificationTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
  for (const exitCode of [0, 7]) serverTest(`inline retry acceptance exit ${exitCode} controls completion`, async () => {
    const { repository, projectRoot, port } = fixture;
    const socket = createSocket(port);
    try {
      await waitForEvent(socket, "connection.ready");
      const opened = await openProject(socket, projectRoot);
      const projectId = opened.payload.project.id, threadId = opened.payload.project.activeThreadId;
      const ready = await sendChatUntilReady(socket, { requestId: "retry-check-plan", projectId, threadId,
        content: "complex task", modeId: "plan", modeLocked: true });
      const source = agentRunStateSchema.parse(ready.payload.run);
      if (!source.plan || !source.subtasks[0]) throw new Error("Expected subagent plan");
      repository.setAgentRunExecutionPlan(projectId, source.id, { ...source.plan,
        contracts: source.plan.contracts.map((contract) => ({ ...contract, verificationCommands: ["bun acceptance.ts"] })) });
      for (const task of source.subtasks) {
        if (task.id === source.subtasks[0].id) repository.markSubtaskFailed(projectId, source.id, task.id, "interrupted", 1);
        else repository.markSubtaskCompleted(projectId, source.id, task.id, "Already finished", 1);
      }
      repository.setAgentRunStatus(projectId, source.id, "failed", "interrupted");
      writeFileSync(path.join(projectRoot, "acceptance.ts"), `await Bun.write("acceptance-ran.txt", "checked"); process.exit(${exitCode});`);
      const status = exitCode === 0 ? "completed" : "failed";
      const finished = waitForEvent(socket, "run.updated", (event) => event.payload.run.id !== source.id
        && event.payload.run.status === status, 10000);
      const completed = exitCode === 0 ? waitForEvent(socket, "chat.complete") : undefined;
      socket.send(JSON.stringify({ type: "run.retry", requestId: "retry-with-check",
        payload: { projectId, threadId, runId: source.id, subagentId: source.subtasks[0].id } }));
      const result = await finished;
      if (exitCode !== 0) expect(result.payload.run.failureMessage).toContain("Verification failed");
      if (completed) {
        const message = (await completed).payload.assistantMessage;
        expect(message.content).toContain("Verification: 1 declared check passed.");
        const last = repository.getThreadMessages(projectId, threadId).at(-1);
        expect(last?.id).toBe(message.id);
        expect(last?.kind).not.toBe("run-milestones");
      }
      expect(await Bun.file(path.join(projectRoot, "acceptance-ran.txt")).text()).toBe("checked");
      expect(repository.getRun(projectId, result.payload.run.id)?.status).toBe(status);
    } finally { socket.close(); }
  }, 15000);
}
