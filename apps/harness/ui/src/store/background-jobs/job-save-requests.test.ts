import { expect, test } from "bun:test";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createJobSaveRequests } from "./job-save-requests";
import { createBackgroundJobFixture } from "../../utils/tests/test-fixtures";
const command: Extract<ClientCommand, { type: "background-job.save" }> = { type: "background-job.save", requestId: "save", payload: { job: createBackgroundJobFixture() } };
test("failed dispatch, disconnect and timeout retain explicit failure boundaries", async () => {
  const requests = createJobSaveRequests({ timeoutMs: 10 });
  await expect(requests.save(command, () => false)).rejects.toThrow("Reconnect");
  const pending = requests.save(command, () => true); requests.cancel(); await expect(pending).rejects.toThrow("Connection changed");
  await expect(requests.save(command, () => true)).rejects.toThrow("timed out");
});
test("a late acknowledgement cannot settle the retry", async () => {
  const requests = createJobSaveRequests(); let done = false;
  const pending = requests.save({ ...command, requestId: "retry" }, () => true).then(() => { done = true; });
  const payload = { backgroundJobs: { jobs: [], runs: [], templates: [] } };
  requests.apply({ type: "background-jobs.updated", requestId: "save", payload }); await Promise.resolve(); expect(done).toBe(false);
  requests.apply({ type: "background-jobs.updated", requestId: "retry", payload }); await pending; expect(done).toBe(true);
});
