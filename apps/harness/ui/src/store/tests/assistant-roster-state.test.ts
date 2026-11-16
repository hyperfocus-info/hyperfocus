import { expect, test } from "bun:test";
import { createAssistantFixture } from "../../utils/tests/test-fixtures";
import { createHarnessStateFixture } from "../../utils/tests/test-fixtures";
import { createEmptyAssistantsState, reduceServerEvent } from "../../harness-store";
import { createAssistantRosterPageState, mergeAssistantRosterPage, rejectAssistantRosterRequest,
  startAssistantRosterRequest } from "../assistant-roster-state";

test("assistant roster pages merge beyond the first 512 rows", () => {
  let assistants = Array.from({ length: 512 }, (_, index) => createAssistantFixture({ id: `assistant-${index}` }));
  let state = startAssistantRosterRequest(createAssistantRosterPageState(), { id: "first" });
  let merged = mergeAssistantRosterPage(assistants, state, "first", { items: assistants.slice(0, 256), nextCursor: "page-2" })!;
  state = startAssistantRosterRequest(merged.page, { id: "third", cursor: "page-3" });
  const third = Array.from({ length: 10 }, (_, index) => createAssistantFixture({ id: `assistant-${512 + index}` }));
  merged = mergeAssistantRosterPage(merged.assistants, state, "third", { items: third })!;
  expect(merged.assistants).toHaveLength(522);
  expect(merged.assistants.at(-1)?.id).toBe("assistant-521");
});

test("authoritative first-page refresh removes stale first-page rows while preserving accumulated pages", () => {
  const oldFirst = [createAssistantFixture({ id: "old" }), createAssistantFixture({ id: "keep" })];
  const later = createAssistantFixture({ id: "later" });
  let state = startAssistantRosterRequest(createAssistantRosterPageState(), { id: "initial" });
  let merged = mergeAssistantRosterPage([], state, "initial", { items: oldFirst, nextCursor: "more" })!;
  state = startAssistantRosterRequest(merged.page, { id: "more", cursor: "more" });
  merged = mergeAssistantRosterPage(merged.assistants, state, "more", { items: [later] })!;
  state = startAssistantRosterRequest(merged.page, { id: "refresh" });
  merged = mergeAssistantRosterPage(merged.assistants, state, "refresh", { items: [oldFirst[1]!] })!;
  expect(merged.assistants.map(({ id }) => id)).toEqual(["later", "keep"]);
  expect(mergeAssistantRosterPage(merged.assistants, merged.page, "stale", { items: [] })).toBeUndefined();
  expect(rejectAssistantRosterRequest(merged.page, "stale", "ignored")).toBe(merged.page);
});

test("bounded assistant deltas preserve accumulated roster and detail state beyond 512", () => {
  const assistants = Array.from({ length: 513 }, (_, index) => createAssistantFixture({ id: `assistant-${index}` }));
  const tail = assistants[512]!;
  const state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants,
    selectedAssistantId: tail.id, loadedDetailAssistantIds: [tail.id], streamingByAssistantId: { [tail.id]: "live" } } });
  const next = reduceServerEvent(state, { type: "assistants.updated", requestId: "delta", payload: { assistants: {
    assistants: [{ ...assistants[0]!, runState: "paused" }], threads: [], todos: [], learnings: [], questions: [], logs: [],
    assetRefs: [] } } });
  expect(next.assistants.assistants).toHaveLength(513);
  expect(next.assistants.selectedAssistantId).toBe(tail.id);
  expect(next.assistants.loadedDetailAssistantIds).toEqual([tail.id]);
  expect(next.assistants.streamingByAssistantId[tail.id]).toBe("live");
});

test("explicit deletions remove roster state and rejected cursors become retryable", () => {
  const assistant = createAssistantFixture({ id: "assistant-delete" });
  let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant],
    selectedAssistantId: assistant.id, loadedDetailAssistantIds: [assistant.id], streamingByAssistantId: {
      [assistant.id]: "live" }, rosterPage: startAssistantRosterRequest(createAssistantRosterPageState(), {
      id: "page-request", cursor: "invalid" }) } });
  state = reduceServerEvent(state, { type: "command.rejected", requestId: "page-request",
    payload: { code: "invalid-cursor", message: "Invalid cursor" } });
  expect(state.assistants.rosterPage).toMatchObject({ status: "error", retryCursor: undefined });
  state = reduceServerEvent(state, { type: "assistants.updated", requestId: "delete", payload: { assistants: {
    assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
    deletedAssistantIds: [assistant.id] } });
  expect(state.assistants.assistants).toEqual([]);
  expect(state.assistants.streamingByAssistantId).toEqual({});
});

test("deleted assistant deltas cannot reintroduce orphan detail rows", () => {
  const assistant = createAssistantFixture({ id: "assistant-orphan" });
  const now = assistant.updatedAt;
  const state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant] } });
  const next = reduceServerEvent(state, { type: "assistants.updated", requestId: "hostile-delete", payload: { assistants: {
    assistants: [], threads: [], todos: [{ id: "orphan-todo", assistantId: assistant.id, title: "Orphan", state: "pending",
      sortOrder: 0, workKind: "unspecified", createdAt: now, updatedAt: now }], learnings: [], questions: [], logs: [], assetRefs: [] },
    deletedAssistantIds: [assistant.id] } });
  expect(next.assistants.assistants).toEqual([]);
  expect(next.assistants.todos).toEqual([]);
});
