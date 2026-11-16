/** @jsxImportSource solid-js */
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../../toast-store";
import { createBackgroundJobFixture, createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";
import { AssistantsPanel } from "../assistants-panel";
import { createAssistantChatBrowserMessages } from "../chat-panel.browser-data";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import "../../global-styles";

setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());

const now = new Date().toISOString();
const project = createViewProjectFixture({ id: "browser-assistant-chat-project" });
const assistantId = "browser-assistant-chat-assistant";
const threadId = "browser-assistant-chat-thread";
const messages = createAssistantChatBrowserMessages("browser-assistant-chat-message");
const sourceJob = createBackgroundJobFixture({ id: "browser-assistant-source-job", projectId: project.id, assistantId,
  automationThreadId: "browser-assistant-job-thread", name: "Browser source job",
  definition: { kind: "ai-routine", prompt: "Exercise source pending feedback." },
  schedule: { type: "one-off", runAt: now, sourceText: now }, scheduleInput: now, createdAt: now, updatedAt: now });

harnessStore.actions.setCommandDispatcher(dispatchFixtureCommand);

function FixtureApp() {
  let host: HTMLDivElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => {
      seedAssistantChatState(true);
      waitFrames(8, () => {
        if (host) {
          host.style.height = "620px";
        }
        requestAnimationFrame(() => {
          if (host) {
            host.dataset.testFixtureReady = "1";
          }
        });
      });
    });
  });

  return (
    <main
      style={{
        width: "100%",
        "max-width": "980px",
        height: "700px",
        padding: "16px",
        "box-sizing": "border-box",
        display: "flex",
        "flex-direction": "column"
      }}
    >
      <div
        ref={host}
        data-test-fixture-host=""
        data-test-fixture-ready="0"
        style={{
          display: "flex",
          "min-height": "0",
          height: "1px",
          overflow: "hidden"
        }}
      >
        <AssistantsPanel variant="detail" />
      </div>
    </main>
  );
}

function waitFrames(count: number, callback: () => void) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitFrames(count - 1, callback));
}

function seedAssistantChatState(withMessages: boolean) {
  harnessStore.replaceStateForTests(
    createHarnessStateFixture({
      connectionState: "connected",
      activeLeftTab: "assistants",
      activeSurface: "assistants",
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      },
      assistants: {
        assistants: [
          {
            id: assistantId,
            name: "Browser assistant",
            scope: "project",
            projectId: project.id,
            description: "Exercises first-load assistant chat geometry.",
            personalityPrompt: "Be direct.",
            jobPrompt: "Work on the repo.",
            agentId: "pi",
            providerBrand: "gpt",
            modeId: "implement",
            executionModelId: "openai/gpt-5.4",
            runState: "active",
            bootstrapState: "completed",
            failureStreakCount: 0,
            circuitBreakerState: "closed",
            unreadQuestionCount: 0,
            createdAt: now,
            updatedAt: now
          }
        ],
        threads: [
          {
            id: threadId,
            assistantId,
            sessionId: threadId,
            messageCount: withMessages ? messages.length : 0,
            messages: withMessages ? messages : [],
            updatedAt: now
          }
        ],
        todos: [{ id: "todo-design", assistantId, title: "Review release setup and recovery for the customer workspace", state: "blocked", blockerReason: "Waiting for a reproducible report", workKind: "app-code", workTarget: "apps/customer-workspace/recovery", sortOrder: 0, createdAt: now, updatedAt: now }],
        learnings: [{ id: "learning-design", assistantId, summary: "Preserve the active customer workspace when a recovery request finishes after the user switches projects.", source: "Recovery regression investigation in apps/customer-workspace", confidence: "high", sortOrder: 0, createdAt: now }],
        questions: [],
        logs: [],
        assetRefs: [],
        jobs: [sourceJob],
        runs: [],
        workloadPagesByAssistantId: { [assistantId]: {
          jobs: { status: "loaded", nextCursor: "browser-jobs-more" }, runs: { status: "loaded" }
        } },
        selectedAssistantId: assistantId,
        selectedTab: "chat",
        selectedLogDetailsId: undefined,
        scopeFilter: "project",
        rosterSearch: "",
        detailSearch: "",
        runStateFilter: undefined,
        bootstrapStateFilter: undefined,
        providerBrandFilter: undefined,
        projectIdFilter: undefined,
        rosterSort: "updated",
        streamingByAssistantId: {}, provisionalReconnectAssistantIds: [],
        rosterPage: { status: "idle", firstPageAssistantIds: [] }, loadedDetailAssistantIds: [assistantId], pendingDetailRequestByAssistantId: {}, detailPagesByAssistantId: {},
        queuedDetailRequestByAssistantId: {}
      }
    })
  );
  harnessStore.actions.setCommandDispatcher(dispatchFixtureCommand);
}

function dispatchFixtureCommand(command: ClientCommand) {
  if (command.type !== "assistant.workloads.list") return;
  setTimeout(() => harnessStore.applyServerEvent({ type: "assistant.workloads.listed", requestId: command.requestId,
    payload: { assistantId: command.payload.assistantId, jobsCursor: command.payload.jobs?.cursor,
      runsCursor: command.payload.runs?.cursor, ...(command.payload.jobs ? { jobs: { items: [] } } : {}),
      ...(command.payload.runs ? { runs: { items: [] } } : {}) } }), 50);
}

render(() => <FixtureApp />, document.getElementById("root")!);
