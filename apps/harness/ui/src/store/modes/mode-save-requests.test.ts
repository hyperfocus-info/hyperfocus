import { expect, it } from "bun:test";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createModeSaveRequests } from "./mode-save-requests";
import { createViewProjectFixture as createProjectFixture } from "../../utils/tests/test-fixtures";

const command: Extract<ClientCommand, { type: "mode.save" }> = { type: "mode.save", requestId: "save-project", payload: { scope: "project", projectId: "project", mode: { id: "review", label: "Review", description: "Review UI", plannerPrompt: "Read", executionPrompt: "Review", toolPolicy: "review-only", executionAccess: "read-only", scope: "project", updatedAt: "2026-09-22T12:00:00Z" } } };
it("project saves require the same request, project and saved mode", async () => {
  const requests = createModeSaveRequests(); let done = false;
  const pending = requests.save(command, () => true).then(() => { done = true; });
  requests.apply({ type: "project.updated", requestId: command.requestId, payload: { projectId: "other", project: { ...createProjectFixture({ id: "other" }), projectModes: [command.payload.mode] } } });
  await Promise.resolve(); expect(done).toBe(false);
  requests.apply({ type: "project.updated", requestId: "other", payload: { projectId: "project", project: { ...createProjectFixture({ id: "project" }), projectModes: [command.payload.mode] } } });
  await Promise.resolve(); expect(done).toBe(false);
  requests.apply({ type: "project.updated", requestId: command.requestId, payload: { projectId: "project", project: { ...createProjectFixture({ id: "project" }), projectModes: [command.payload.mode] } } });
  await pending; expect(done).toBe(true);
});
it("failed dispatch and connection cancellation reject without claiming a save", async () => {
  const requests = createModeSaveRequests();
  await expect(requests.save(command, () => false)).rejects.toThrow("Reconnect");
  const pending = requests.save(command, () => true);
  requests.cancel(); await expect(pending).rejects.toThrow("Connection changed");
});
it("a late timed-out acknowledgement cannot complete a newer retry", async () => {
  const requests = createModeSaveRequests({ timeoutMs: 25 });
  await expect(requests.save(command, () => true)).rejects.toThrow("timed out");
  let saved = false;
  const retry = { ...command, requestId: "retry" };
  const pending = requests.save(retry, () => true).then(() => { saved = true; });
  const payload = { projectId: "project", project: { ...createProjectFixture({ id: "project" }), projectModes: [command.payload.mode] } };
  requests.apply({ type: "project.updated", requestId: command.requestId, payload });
  await Promise.resolve(); expect(saved).toBe(false);
  requests.apply({ type: "project.updated", requestId: retry.requestId, payload });
  await pending; expect(saved).toBe(true);
});
