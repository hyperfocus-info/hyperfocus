import { expect, test } from "bun:test";
import { createChatMessage } from "@hyperfocus/ai-core/protocol";
import { createInitialViewState, reduceServerEvent } from "../../harness-store";
import { createRunFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";

test("project activation hydrates a remembered empty catalog thread without discarding its persisted run", () => {
  const shell = createViewProjectFixture({ id: "catalog-project" });
  let state = reduceServerEvent(createInitialViewState(), {
    type: "workspace.updated", requestId: "bootstrap", payload: { workspace: { projects: [shell] } }
  });
  const run = createRunFixture({ status: "stopped", detailState: "summary" });
  state = reduceServerEvent(state, {
    type: "project.updated", requestId: "activate", payload: { projectId: shell.id,
      project: { ...shell, activeRun: run, lastRun: run,
        session: { ...shell.session, messages: [createChatMessage("user", "Build the whole product")] },
        runSummaries: [{ id: run.id, threadId: run.threadId, status: run.status, resumable: true, retryable: true, updatedAt: run.updatedAt }] }
    }
  });
  const hydrated = state.workspace.projects[0]!;
  expect(hydrated.activeRun?.id).toBe(run.id);
  expect(hydrated.lastRun?.status).toBe("stopped");
  expect(hydrated.runSummaries).toHaveLength(1);
  expect(hydrated.session.messages[0]?.content).toBe("Build the whole product");
});
