/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { createUiTest } from "../../utils/tests/test-harness";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { AssistantsPanel } from "../../components/assistants-panel";
import { createEmptyAssistantsState, harnessStore, reduceServerEvent } from "../../harness-store";
import { createAssistantFixture, createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { captureDispatchedCommands, clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { ASSISTANT_DETAIL_CACHE_LIMIT, completeAssistantDetailPage, completeAssistantDetailRequest, invalidateAssistantDetails,
  retainAssistantDetailRequestState, retainAssistantDetailScopes, startAssistantDetailPageRequest, touchAssistantDetailScope,
  type AssistantDetailPageState } from "../assistant-detail-state";

createUiTest("assistant detail state", () => {
  it("exposes roster load-more and preserves its cursor in the command", async () => {
    clearBrowserStateForTests();
    const assistant = createAssistantFixture({ id: "assistant-roster-page" });
    seedHarnessStoreForTests(createHarnessStateFixture({ connectionState: "connected", activeLeftTab: "assistants",
      activeSurface: "assistants", assistants: { ...createEmptyAssistantsState(), assistants: [assistant],
        rosterPage: { status: "loaded", nextCursor: "assistant-page-2", firstPageAssistantIds: [assistant.id] } } }));
    const commands: ClientCommand[] = [];
    captureDispatchedCommands(commands);
    const view = render(() => <AssistantsPanel variant="roster" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more assistants" }));
    expect(commands).toContainEqual({ type: "assistant.summary.list", requestId: expect.any(String),
      payload: { cursor: "assistant-page-2", limit: 256 } });
    view.unmount();
  });

  it("clears invalidated loaded rows and request ownership", () => {
    const assistant = createAssistantFixture();
    const state = { ...createEmptyAssistantsState(), assistants: [assistant], loadedDetailAssistantIds: [assistant.id],
      pendingDetailRequestByAssistantId: { [assistant.id]: "old-request" }, todos: [{ id: "todo-1", assistantId: assistant.id,
        title: "Stale", state: "pending" as const, sortOrder: 0, workKind: "unspecified" as const,
        createdAt: assistant.createdAt, updatedAt: assistant.updatedAt }] };
    const invalidated = invalidateAssistantDetails(state, [assistant.id]);
    expect(invalidated.todos).toEqual([]);
    expect(invalidated.loadedDetailAssistantIds).toEqual([]);
    expect(invalidated.pendingDetailRequestByAssistantId).toEqual({});
  });

  it("refetches an open detail after each persisted child mutation invalidates it", async () => {
    clearBrowserStateForTests();
    const project = createViewProjectFixture({ id: "project-detail-refresh" });
    const assistant = createAssistantFixture({ id: "assistant-detail-refresh", projectId: project.id });
    seedHarnessStoreForTests(createHarnessStateFixture({ activeLeftTab: "assistants", activeSurface: "assistants",
      workspace: { activeProjectId: project.id, projects: [project] }, assistants: { ...createEmptyAssistantsState(),
        assistants: [assistant], selectedAssistantId: assistant.id, selectedTab: "todos", loadedDetailAssistantIds: [assistant.id] } }));
    const commands: ClientCommand[] = [];
    captureDispatchedCommands(commands);
    const view = render(() => <AssistantsPanel variant="detail" />);
    await Promise.resolve();
    expect(commands.some((command) => command.type === "assistant.detail.get")).toBe(false);
    const mutationKinds = ["question", "todo", "learning", "reprioritize", "compaction"];
    for (const [index, mutationKind] of mutationKinds.entries()) {
      harnessStore.applyServerEvent({ type: "assistants.updated", requestId: `${mutationKind}-invalidated`, payload: {
        assistants: { assistants: [assistant], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
        invalidatedDetailAssistantIds: [assistant.id] } });
      expect(harnessStore.state.assistants.loadedDetailAssistantIds).toEqual([]);
      await waitFor(() => expect(commands.filter((command) => command.type === "assistant.detail.get")).toHaveLength(index + 1));
      const request = commands.filter((command): command is Extract<ClientCommand, { type: "assistant.detail.get" }> =>
        command.type === "assistant.detail.get")[index];
      if (!request) throw new Error(`Missing ${mutationKind} detail request`);
      expect(request.payload).toEqual({ assistantId: assistant.id });
      harnessStore.applyServerEvent({ type: "assistant.detail.loaded", requestId: request.requestId, payload: { detail: {
        assistant, todos: { items: [] }, learnings: { items: [] }, questions: { items: [] }, logs: { items: [] }, assetRefs: [] } } });
      expect(harnessStore.state.assistants.loadedDetailAssistantIds).toEqual([assistant.id]);
    }
    harnessStore.applyServerEvent({ type: "assistants.updated", requestId: "rejected-invalidated", payload: {
      assistants: { assistants: [assistant], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
      invalidatedDetailAssistantIds: [assistant.id] } });
    const rejectedRequest = commands.filter((command) => command.type === "assistant.detail.get").at(-1);
    if (!rejectedRequest) throw new Error("Missing rejected detail request");
    harnessStore.applyServerEvent({ type: "command.rejected", requestId: rejectedRequest.requestId,
      payload: { message: "Detail changed during read" } });
    expect(harnessStore.state.assistants.pendingDetailRequestByAssistantId).toEqual({});
    harnessStore.actions.requestSelectedAssistantDetail();
    expect(commands.filter((command) => command.type === "assistant.detail.get")).toHaveLength(mutationKinds.length + 2);
    harnessStore.applyServerEvent({ type: "assistant.detail.loaded",
      requestId: commands.at(-1)?.requestId ?? "missing", payload: { detail: { assistant, todos: { items: [] },
        learnings: { items: [] }, questions: { items: [] }, logs: { items: [] }, assetRefs: [] } } });
    view.unmount();
    harnessStore.applyServerEvent({ type: "assistants.updated", requestId: "unmounted-invalidated", payload: {
      assistants: { assistants: [assistant], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
      invalidatedDetailAssistantIds: [assistant.id] } });
    expect(commands.filter((command) => command.type === "assistant.detail.get")).toHaveLength(mutationKinds.length + 2);
  });

  it("owns, merges, refreshes, bounds, and rejects detail pages without accepting stale responses", () => {
    const assistant = createAssistantFixture({ id: "assistant-pages" });
    const now = assistant.createdAt;
    const detailPage: AssistantDetailPageState = { messages: { status: "loaded", nextCursor: "messages-2", hasMore: true },
      todos: { status: "loaded", nextCursor: "todos-2", hasMore: true }, learnings: { status: "loaded" },
      questions: { status: "loaded" }, logs: { status: "loaded" } };
    let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant],
      loadedDetailAssistantIds: [assistant.id], detailPagesByAssistantId: { [assistant.id]: detailPage }, todos: [{ id: "todo-new",
        assistantId: assistant.id, title: "Newest", state: "pending", sortOrder: 0, workKind: "unspecified", createdAt: now, updatedAt: now }] } });
    state = { ...state, assistants: startAssistantDetailPageRequest(state.assistants, assistant.id, "todos",
      { id: "todos-more", cursor: "todos-2" }) };
    const stale = reduceServerEvent(state, { type: "assistant.todos.listed", requestId: "stale", payload: { assistantId: assistant.id,
      todos: { items: [], nextCursor: "wrong" } } });
    expect(stale).toBe(state);
    const older = { id: "todo-old", assistantId: assistant.id, title: "Older", state: "pending" as const, sortOrder: 1,
      workKind: "unspecified" as const, createdAt: now, updatedAt: now };
    state = reduceServerEvent(state, { type: "assistant.todos.listed", requestId: "todos-more", payload: { assistantId: assistant.id,
      todos: { items: [older], nextCursor: "todos-3" } } });
    expect(state.assistants.todos.map((todo) => todo.id)).toEqual(["todo-new", "todo-old"]);
    state = { ...state, assistants: startAssistantDetailPageRequest(state.assistants, assistant.id, "todos", { id: "refresh" }) };
    state = reduceServerEvent(state, { type: "assistant.todos.listed", requestId: "refresh", payload: { assistantId: assistant.id,
      todos: { items: [older] } } });
    expect(state.assistants.todos.map((todo) => todo.id)).toEqual(["todo-old"]);
    const capped = { ...state.assistants, todos: Array.from({ length: ASSISTANT_DETAIL_CACHE_LIMIT }, (_, index) => ({ ...older,
      id: `todo-${index}`, sortOrder: index })) };
    const cappedLoading = startAssistantDetailPageRequest(capped, assistant.id, "todos", { id: "cap", cursor: "next" });
    const completed = completeAssistantDetailPage(cappedLoading, assistant.id, "todos", "cap", "still-more");
    expect(completed.detailPagesByAssistantId[assistant.id]?.todos.nextCursor).toBeUndefined();
    expect(completed.detailPagesByAssistantId[assistant.id]?.todos.cacheLimitReached).toBe(true);
    const rejected = reduceServerEvent({ ...state, assistants: startAssistantDetailPageRequest(state.assistants, assistant.id,
      "todos", { id: "bad-cursor", cursor: "bad" }) }, { type: "command.rejected", requestId: "bad-cursor",
      payload: { message: "Invalid cursor", code: "invalid-cursor" } });
    expect(rejected.assistants.detailPagesByAssistantId[assistant.id]?.todos.retryCursor).toBeUndefined();
    const reset = retainAssistantDetailRequestState(rejected.assistants, new Set([assistant.id]), false);
    expect(reset.detailPagesByAssistantId).toEqual({});
    const afterReady = { ...rejected, assistants: { ...rejected.assistants, ...reset, todos: [] } };
    expect(reduceServerEvent(afterReady, { type: "assistant.todos.listed", requestId: "bad-cursor", payload: {
      assistantId: assistant.id, todos: { items: [older] } } }).assistants.todos).toEqual([]);
  });

  it("sends reachable load-more commands for every assistant detail collection", async () => {
    clearBrowserStateForTests();
    const project = createViewProjectFixture({ id: "project-controls" });
    const assistant = createAssistantFixture({ id: "assistant-controls", projectId: project.id });
    const page = (): AssistantDetailPageState => ({ messages: { status: "loaded", nextCursor: "m", hasMore: true },
      todos: { status: "loaded", nextCursor: "t", hasMore: true }, learnings: { status: "loaded", nextCursor: "l", hasMore: true },
      questions: { status: "loaded", nextCursor: "q", hasMore: true }, logs: { status: "loaded", nextCursor: "g", hasMore: true } });
    const commands: ClientCommand[] = [];
    for (const [tab, label] of [["chat", "earlier messages"], ["todos", "more todos"], ["questions", "more questions"],
      ["log", "more logs"], ["learnings", "more learnings"]] as const) {
      seedHarnessStoreForTests(createHarnessStateFixture({ activeLeftTab: "assistants", activeSurface: "assistants",
        workspace: { activeProjectId: project.id, projects: [project] }, assistants: { ...createEmptyAssistantsState(),
          assistants: [assistant], selectedAssistantId: assistant.id, selectedTab: tab, loadedDetailAssistantIds: [assistant.id],
          detailPagesByAssistantId: { [assistant.id]: page() } } }));
      captureDispatchedCommands(commands);
      const view = render(() => <AssistantsPanel variant="detail" />);
      await waitFor(() => expect(screen.getByRole("button", { name: `Load ${label}` })).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: `Load ${label}` }));
      view.unmount();
    }
    expect(commands.map((command) => command.type)).toEqual(["assistant.thread.messages.list", "assistant.todos.list",
      "assistant.questions.list", "assistant.logs.list", "assistant.learnings.list"]);
    for (const command of commands) expect(command).toMatchObject({ payload: { limit: 256 } });
  });

  it("drops orphan streams and bounds live logs without letting late events recreate deleted state", () => {
    const assistant = createAssistantFixture({ id: "assistant-live-bound" });
    const now = assistant.createdAt;
    const detailPage: AssistantDetailPageState = { messages: { status: "loaded" }, todos: { status: "loaded" },
      learnings: { status: "loaded" }, questions: { status: "loaded" }, logs: { status: "loaded" } };
    let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant],
      loadedDetailAssistantIds: [assistant.id], detailPagesByAssistantId: { [assistant.id]: detailPage },
      streamingByAssistantId: { [assistant.id]: "in flight" } } });
    for (let index = 0; index < ASSISTANT_DETAIL_CACHE_LIMIT + 5; index += 1) state = reduceServerEvent(state, {
      type: "assistant.log.appended", requestId: `log-${index}`, payload: { entry: { id: `log-${index}`,
        assistantId: assistant.id, level: "info", summary: `Log ${index}`, createdAt: now } } });
    expect(state.assistants.logs).toHaveLength(ASSISTANT_DETAIL_CACHE_LIMIT);
    expect(state.assistants.detailPagesByAssistantId[assistant.id]?.logs).toMatchObject({ hasMore: false,
      cacheLimitReached: true, nextCursor: undefined });
    state = reduceServerEvent(state, { type: "assistants.updated", requestId: "deleted", payload: { assistants: {
      assistants: [], threads: [], todos: [], learnings: [], questions: [], logs: [], assetRefs: [] },
      deletedAssistantIds: [assistant.id] } });
    expect(state.assistants.streamingByAssistantId).toEqual({});
    expect(reduceServerEvent(state, { type: "assistant.chat.delta", requestId: "late", payload: {
      assistantId: assistant.id, sessionId: "deleted-session", delta: "ghost" } })).toBe(state);
  });

  it("merges only named live messages into the bounded demanded scope and rebases its page", () => {
    const assistant = createAssistantFixture({ id: "assistant-live-messages" });
    const createdAt = assistant.createdAt;
    const messages = Array.from({ length: ASSISTANT_DETAIL_CACHE_LIMIT }, (_, index) => ({ id: `message-${index}`,
      role: "user" as const, kind: "plain" as const, content: `Message ${index}`, createdAt }));
    const thread = { id: "assistant-thread-live", assistantId: assistant.id, sessionId: "session-live", messageCount: messages.length,
      messages, updatedAt: createdAt };
    const page: AssistantDetailPageState = { messages: { status: "loaded", nextCursor: "older", hasMore: true },
      todos: { status: "loaded" }, learnings: { status: "loaded" }, questions: { status: "loaded" }, logs: { status: "loaded" } };
    const incoming = { id: "message-new", role: "user" as const, kind: "plain" as const, content: "Replacement", createdAt };
    let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant], threads: [thread],
      loadedDetailAssistantIds: [assistant.id], detailPagesByAssistantId: { [assistant.id]: page },
      streamingByAssistantId: { [assistant.id]: "obsolete partial" } } });
    state = reduceServerEvent(state, { type: "assistant.chat.message-appended", requestId: "live-message", payload: {
      assistantId: assistant.id, sessionId: thread.sessionId, message: incoming,
      thread: { id: thread.id, assistantId: assistant.id, sessionId: thread.sessionId, messageCount: 5_000,
        latestMessageId: incoming.id, updatedAt: createdAt } } });
    expect(state.assistants.threads[0]?.messages).toHaveLength(ASSISTANT_DETAIL_CACHE_LIMIT);
    expect(state.assistants.threads[0]?.messages.at(-1)?.id).toBe(incoming.id);
    expect(state.assistants.streamingByAssistantId[assistant.id]).toBe("");
    expect(state.assistants.detailPagesByAssistantId[assistant.id]?.messages).toMatchObject({ hasMore: false,
      cacheLimitReached: true, nextCursor: undefined });
    state = reduceServerEvent(state, { type: "assistant.chat.message-appended", requestId: "lower-live-count", payload: {
      assistantId: assistant.id, sessionId: thread.sessionId, message: incoming,
      thread: { id: thread.id, assistantId: assistant.id, sessionId: thread.sessionId, messageCount: 2,
        latestMessageId: incoming.id, updatedAt: createdAt } } });
    expect(state.assistants.threads[0]?.messageCount).toBe(5_000);
    const current = { ...state, assistants: { ...state.assistants,
      streamingByAssistantId: { [assistant.id]: "current partial" } } };
    expect(reduceServerEvent(current, { type: "assistant.chat.delta", requestId: "delta-stale",
      payload: { assistantId: assistant.id, sessionId: "stale-session", delta: "ghost" } })).toBe(current);
    const stale = reduceServerEvent(current, { type: "assistant.chat.message-appended", requestId: "stale-session", payload: {
      assistantId: assistant.id, sessionId: "stale-session", message: { ...incoming, id: "stale-message" },
      thread: { id: thread.id, assistantId: assistant.id, sessionId: "stale-session", messageCount: 1,
        latestMessageId: "stale-message", updatedAt: createdAt } } });
    expect(stale).toBe(current);
    const failed = reduceServerEvent(current, { type: "assistant.chat.failed", requestId: "failed-current",
      payload: { assistantId: assistant.id, sessionId: thread.sessionId } });
    expect(failed.assistants.streamingByAssistantId[assistant.id]).toBe("");
    expect(reduceServerEvent(current, { type: "assistant.chat.failed", requestId: "failed-stale",
      payload: { assistantId: assistant.id, sessionId: "stale-session" } })).toBe(current);
  });

  it("creates the first bounded thread from a demanded live message", () => {
    const assistant = createAssistantFixture({ id: "assistant-first-live" }), createdAt = assistant.createdAt;
    const message = { id: "first-message", role: "user" as const, kind: "plain" as const, content: "First", createdAt };
    const empty = { ...createEmptyAssistantsState(), assistants: [assistant] };
    const detail = completeAssistantDetailRequest(empty, { assistant, todos: { items: [] }, learnings: { items: [] },
      questions: { items: [] }, logs: { items: [] }, assetRefs: [] });
    const state = createHarnessStateFixture({ assistants: { ...empty, ...detail,
      streamingByAssistantId: { [assistant.id]: "old" } } });
    const next = reduceServerEvent(state, { type: "assistant.chat.message-appended", requestId: "first-live", payload: {
      assistantId: assistant.id, sessionId: "first-session", message, thread: { id: "first-thread", assistantId: assistant.id,
        sessionId: "first-session", messageCount: 1, latestMessageId: message.id, updatedAt: createdAt } } });
    expect(next.assistants.threads[0]?.messages).toEqual([message]);
    expect(next.assistants.detailPagesByAssistantId[assistant.id]?.messages).toMatchObject({ status: "loaded", hasMore: false });
    expect(next.assistants.streamingByAssistantId[assistant.id]).toBe("");
  });

  it("prevents older and equal-conflicting live frames from regressing same-session state", () => {
    const assistant = createAssistantFixture({ id: "assistant-live-order" });
    const olderAt = "2026-01-01T00:00:00.000Z", newerAt = "2026-01-01T00:00:01.000Z";
    const userMessage = { id: "user-ordered", role: "user" as const, kind: "plain" as const,
      content: "Current user content", createdAt: olderAt };
    const assistantMessage = { id: "assistant-ordered", role: "assistant" as const, kind: "plain" as const,
      content: "Current assistant content", createdAt: newerAt };
    const currentSummary = { id: "summary-current", scope: "thread" as const, label: "Current", content: "Current memory",
      updatedAt: newerAt, source: "generated" as const };
    const staleSummary = { ...currentSummary, id: "summary-stale", label: "Stale", content: "Stale memory", updatedAt: olderAt };
    const thread = { id: "thread-ordered", assistantId: assistant.id, sessionId: "session-ordered", messageCount: 2,
      memorySummary: currentSummary, messages: [userMessage, assistantMessage], updatedAt: newerAt };
    let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant], threads: [thread],
      loadedDetailAssistantIds: [assistant.id], streamingByAssistantId: { [assistant.id]: "current partial" } } });
    const staleAppended = reduceServerEvent(state, { type: "assistant.chat.message-appended", requestId: "stale-appended", payload: {
      assistantId: assistant.id, sessionId: thread.sessionId, message: { ...userMessage, content: "Stale user content" },
      thread: { ...thread, messageCount: 1, memorySummary: staleSummary, latestMessageId: userMessage.id, updatedAt: olderAt } } });
    expect(staleAppended).toBe(state);
    expect(staleAppended.assistants.streamingByAssistantId[assistant.id]).toBe("current partial");

    state = reduceServerEvent(state, { type: "assistant.chat.complete", requestId: "equal-complete", payload: {
      assistantId: assistant.id, sessionId: thread.sessionId,
      assistantMessage: { ...assistantMessage, content: "Conflicting equal content" },
      thread: { ...thread, memorySummary: staleSummary, latestMessageId: assistantMessage.id } } });
    expect(state.assistants.threads[0]).toMatchObject({ updatedAt: newerAt, memorySummary: currentSummary });
    expect(state.assistants.threads[0]?.messages.find(({ id }) => id === assistantMessage.id)?.content)
      .toBe("Current assistant content");
    expect(state.assistants.streamingByAssistantId[assistant.id]).toBe("");

    const activeStream = { ...state, assistants: { ...state.assistants,
      streamingByAssistantId: { [assistant.id]: "newer partial" } } };
    const staleComplete = reduceServerEvent(activeStream, { type: "assistant.chat.complete", requestId: "stale-complete", payload: {
      assistantId: assistant.id, sessionId: thread.sessionId, assistantMessage: { ...assistantMessage, content: "Stale complete" },
      thread: { ...thread, messageCount: 1, memorySummary: staleSummary,
        latestMessageId: assistantMessage.id, updatedAt: olderAt } } });
    expect(staleComplete).toBe(activeStream);
    expect(staleComplete.assistants.streamingByAssistantId[assistant.id]).toBe("newer partial");

    const legacyThread = { ...thread, memorySummary: staleSummary, updatedAt: "legacy-timestamp" };
    const legacyState = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants: [assistant],
      threads: [legacyThread], loadedDetailAssistantIds: [assistant.id],
      streamingByAssistantId: { [assistant.id]: "legacy partial" } } });
    const recoveredAppend = reduceServerEvent(legacyState, { type: "assistant.chat.message-appended", requestId: "recover-append",
      payload: { assistantId: assistant.id, sessionId: thread.sessionId,
        message: { ...userMessage, content: "Recovered user content" },
        thread: { ...thread, memorySummary: currentSummary, latestMessageId: userMessage.id } } });
    expect(recoveredAppend.assistants.threads[0]).toMatchObject({ updatedAt: newerAt, memorySummary: currentSummary });
    expect(recoveredAppend.assistants.threads[0]?.messages.find(({ id }) => id === userMessage.id)?.content)
      .toBe("Recovered user content");
    expect(recoveredAppend.assistants.streamingByAssistantId[assistant.id]).toBe("");
    const recoveredComplete = reduceServerEvent(legacyState, { type: "assistant.chat.complete", requestId: "recover-complete",
      payload: { assistantId: assistant.id, sessionId: thread.sessionId,
        assistantMessage: { ...assistantMessage, content: "Recovered assistant content" },
        thread: { ...thread, memorySummary: currentSummary, latestMessageId: assistantMessage.id } } });
    expect(recoveredComplete.assistants.threads[0]?.messages.find(({ id }) => id === assistantMessage.id)?.content)
      .toBe("Recovered assistant content");
    expect(recoveredComplete.assistants.streamingByAssistantId[assistant.id]).toBe("");
  });

  it("ignores live detail rows and streams for unloaded assistant scopes", () => {
    const assistants = Array.from({ length: 9 }, (_, index) => createAssistantFixture({ id: `assistant-unloaded-${index}` }));
    let state = createHarnessStateFixture({ assistants: { ...createEmptyAssistantsState(), assistants } });
    for (const assistant of assistants) {
      const message = { id: `message-${assistant.id}`, role: "user" as const, kind: "plain" as const,
        content: "Unloaded", createdAt: assistant.createdAt };
      state = reduceServerEvent(state, { type: "assistant.chat.delta", requestId: `delta-${assistant.id}`,
        payload: { assistantId: assistant.id, sessionId: `session-${assistant.id}`, delta: "orphan" } });
      state = reduceServerEvent(state, { type: "assistant.chat.message-appended", requestId: `message-${assistant.id}`, payload: {
        assistantId: assistant.id, sessionId: `session-${assistant.id}`, message, thread: { id: `thread-${assistant.id}`,
          assistantId: assistant.id, sessionId: `session-${assistant.id}`, messageCount: 1,
          latestMessageId: message.id, updatedAt: assistant.updatedAt } } });
      state = reduceServerEvent(state, { type: "assistant.question.updated", requestId: `question-${assistant.id}`, payload: {
        question: { id: `question-${assistant.id}`, assistantId: assistant.id, prompt: "Unloaded?", status: "pending",
          askedAt: assistant.createdAt } } });
    }
    expect(state.assistants.threads).toEqual([]);
    expect(state.assistants.questions).toEqual([]);
    expect(state.assistants.streamingByAssistantId).toEqual({});
  });

  it("evicts assistant detail scopes by true access recency", () => {
    const assistants = Array.from({ length: 9 }, (_, index) => createAssistantFixture({ id: `assistant-${index}` }));
    let state = { ...createEmptyAssistantsState(), assistants, loadedDetailAssistantIds: assistants.slice(0, 8).map(({ id }) => id),
      streamingByAssistantId: Object.fromEntries(assistants.slice(0, 8).map(({ id }) => [id, `stream-${id}`])) };
    state = touchAssistantDetailScope(state, assistants[0]!.id);
    state = retainAssistantDetailScopes({ ...state, ...completeAssistantDetailRequest(state, { assistant: assistants[8]!,
      todos: { items: [] }, learnings: { items: [] }, questions: { items: [] }, logs: { items: [] }, assetRefs: [] }) });
    expect(state.loadedDetailAssistantIds).toEqual(["assistant-2", "assistant-3", "assistant-4", "assistant-5",
      "assistant-6", "assistant-7", "assistant-0", "assistant-8"]);
    expect(state.streamingByAssistantId).not.toHaveProperty("assistant-1");
  });
});
