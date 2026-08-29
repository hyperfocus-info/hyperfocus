import { expect, test } from "bun:test";
import { createPagingUnavailableCallbacks, type PagingUnavailableItem } from "./paging-unavailable-state";

test("background deletion clears unavailable jobs and owned runs exactly", () => {
  let state: PagingUnavailableItem[] = [
    { collection: "jobs", id: "job-deleted", projectId: "project-a", reason: "item-too-large" },
    { collection: "runs", id: "run-deleted", jobId: "job-deleted", projectId: "project-a", reason: "item-too-large" },
    { collection: "runs", id: "run-kept", jobId: "job-kept", projectId: "project-b", reason: "item-too-large" }
  ];
  const callbacks = createPagingUnavailableCallbacks({ get: () => state, set: (items) => { state = items; },
    notify: () => undefined });
  callbacks.backgroundDeleted(["job-deleted"], []);
  expect(state.map(({ id }) => id)).toEqual(["run-kept"]);
  callbacks.backgroundDeleted([], ["project-b"]);
  expect(state).toEqual([]);
});

test("ready collections clear recovered identities regardless of retained ownership metadata", () => {
  let state: PagingUnavailableItem[] = [
    { collection: "jobs", id: "recovered-job", projectId: "project-a", reason: "item-too-large" },
    { collection: "runs", id: "recovered-run", jobId: "recovered-job", projectId: "project-a", reason: "item-too-large" },
    { collection: "threads", id: "same-id", projectId: "project-a", reason: "item-too-large" }
  ];
  const callbacks = createPagingUnavailableCallbacks({ get: () => state, set: (items) => { state = items; },
    notify: () => undefined });
  callbacks.available("jobs", ["recovered-job"]);
  callbacks.available("runs", ["recovered-run"]);
  callbacks.available("threads", ["same-id"], "project-b");
  expect(state).toEqual([{ collection: "threads", id: "same-id", projectId: "project-a", reason: "item-too-large" }]);
});

test("authoritative reconciliation clears absent identities only after retaining re-reported failures", () => {
  let state: PagingUnavailableItem[] = [
    { collection: "notifications", id: "archived", reason: "item-too-large" },
    { collection: "notifications", id: "still-large", reason: "item-too-large" },
    { collection: "threads", id: "archived-thread", projectId: "project-a", reason: "item-too-large" },
    { collection: "threads", id: "other-project", projectId: "project-b", reason: "item-too-large" }
  ];
  const callbacks = createPagingUnavailableCallbacks({ get: () => state, set: (items) => { state = items; }, notify: () => undefined });
  callbacks.reconciled("notifications", ["still-large"]);
  callbacks.reconciled("threads", [], "project-a");
  expect(state.map(({ id }) => id)).toEqual(["still-large", "other-project"]);
});
