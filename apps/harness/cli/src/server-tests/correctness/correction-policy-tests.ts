import { expect } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createChatSendCommand, createSocket, executeReadyRunUntil, openProject, waitForEvent } from "../support/server-test-client";
import type { ServerSuiteFixture } from "../support/server-suite-fixture";
import type { ServerTestRegistrar } from "../support/server-test-sharding";

export function registerCorrectionPolicyTests(serverTest: ServerTestRegistrar, fixture: ServerSuiteFixture) {
  for (const policy of ["ask-before-iterate", "auto-once", "auto-until-clean"] as const) {
    for (const difficulty of ["low", "high"] as const) {
      serverTest(`${policy} bounds unchanged ${difficulty}-difficulty corrections`, async () => {
        const { repository, projectRoot, port, adapter } = fixture;
        if (difficulty === "low") writeFileSync(path.join(projectRoot, "tmp-helper.ts"), "export const value = 1;\n");
        else writeFileSync(path.join(projectRoot, "index.html"), '<script src="./app.ts"></script>');
        const socket = createSocket(port);
        try {
          await waitForEvent(socket, "connection.ready");
          const opened = await openProject(socket, projectRoot);
          const projectId = opened.payload.project.id;
          const threadId = opened.payload.project.activeThreadId;
          const initial = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready");
          socket.send(JSON.stringify(createChatSendCommand({ requestId: "policy-plan", projectId, threadId, content: "simple task" })));
          const ready = await initial;
          const plan = ready.payload.run.plan;
          if (!plan) throw new Error("Expected a frozen plan");
          repository.setAgentRunExecutionPlan(projectId, ready.payload.run.id, { ...plan, correctnessPolicy: policy });
          const executions = policy === "ask-before-iterate" ? 1 : policy === "auto-once" ? 2 : 4;
          const stopped = waitForEvent(socket, "run.updated", (event) => event.payload.run.status === "ready"
            && event.payload.run.plan?.iteration === executions + 1, 10000);
          await executeReadyRunUntil(socket, { requestId: "policy-execute", projectId, threadId, runId: ready.payload.run.id },
            [stopped], 10000, { includeChatComplete: false });
          const result = await stopped;
          expect(result.payload.run.plan?.origin).toBe("correctness-followup");
          expect(adapter.calls.filter((call) => call.kind === "executor")).toHaveLength(executions);
          expect(repository.getRun(projectId, ready.payload.run.id)?.status).toBe("ready");
        } finally { socket.close(); }
      }, 15000);
    }
  }
}
