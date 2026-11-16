import { describe, expect, test } from "bun:test";
import type { BackgroundJob } from "@hyperfocus/ai-core/protocol";
import { useServerSuiteFixture } from "./support/server-suite-fixture";
import { createSocket, openProject, waitForEvent } from "./support/server-test-client";

describe("Scheduled task persistence acknowledgement", () => {
  const fixture = useServerSuiteFixture({ fixtureName: "job-save-acknowledgement", useFastOsAdapters: true });
  test("create, edit and run promotion acknowledge the exact request only after the job is readable", async () => {
    const socket = createSocket(fixture.port);
    try {
      await waitForEvent(socket, "connection.ready");
      const projectId = (await openProject(socket, fixture.projectRoot)).payload.project.id;
      const now = new Date().toISOString();
      const job: BackgroundJob = { id: crypto.randomUUID(), projectId, automationThreadId: crypto.randomUUID(), kind: "shell", name: "Checks", status: "paused", riskLevel: "unsafe", definition: { kind: "shell", executable: "bun", args: ["--version"], timeoutSeconds: 60 }, schedule: { type: "interval", intervalSeconds: 3600, nextRunAt: "2099-01-01T00:00:00Z", sourceText: "1h" }, scheduleInput: "1h", createdAt: now, updatedAt: now };
      for (const source of ["create", "edit", "promote"] as const) {
        const value = { ...job, id: source === "promote" ? crypto.randomUUID() : job.id, name: `Checks ${source}`, createdFromRunId: source === "promote" ? "completed-run" : undefined };
        const requestId = `save-${source}`;
        const response = waitForEvent(socket, "background-jobs.updated", event => event.requestId === requestId);
        socket.send(JSON.stringify({ type: "background-job.save", requestId, payload: { job: value } }));
        await response;
        expect(fixture.repository.getBackgroundJob(value.id)?.name).toBe(value.name);
        expect(fixture.repository.getBackgroundJob(value.id)?.createdFromRunId).toBe(value.createdFromRunId);
      }
      const rejected = waitForEvent(socket, "command.rejected", event => event.requestId === "bad-project");
      socket.send(JSON.stringify({ type: "background-job.save", requestId: "bad-project", payload: { job: { ...job, projectId: "missing-project" } } }));
      await rejected;
      expect(fixture.repository.getBackgroundJob(job.id)?.projectId).toBe(projectId);
    } finally { socket.close(); }
  }, 30000);
});
