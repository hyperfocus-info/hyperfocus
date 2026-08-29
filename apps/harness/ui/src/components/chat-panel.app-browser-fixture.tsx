/** @jsxImportSource solid-js */
import { render } from "solid-js/web";
import {
  createEmptySession,
  createProjectThreadSummary,
  createWorkspaceProjectState,
  type ServerEvent
} from "@hyperfocus/ai-core/protocol";
import { defaultAgentCatalog } from "@hyperfocus/ai-core/agent-catalog";
import "../global-styles";
import { App } from "../app";
import {
  createEmptyAssistantsState,
  createEmptyBackgroundJobsState,
  createEmptyNotificationInboxState,
  createEmptyTokenUsageState,
  createInitialExecutionControlState,
  createInitialSetupState
} from "../harness-store";
import { UiStateProviders } from "../store-providers";
import { createBackgroundJobFixture, createBackgroundJobRunFixture, defaultPreferencesFixture } from "../utils/tests/test-fixtures";
import { createProjectChatBrowserMessages } from "./chat-panel.browser-data";

const threadId = "browser-project-chat-app-thread";
const projectId = "browser-project-chat-app-project";
const messages = createProjectChatBrowserMessages("browser-project-chat-app-message");
const now = new Date().toISOString();
const project = createWorkspaceProjectState({
  id: projectId,
  name: "repo-one",
  rootPath: "C:\\repo-one",
  activeThreadId: threadId,
  session: {
    ...createEmptySession(threadId),
    messages
  },
  threads: [
    createProjectThreadSummary({
      id: threadId,
      title: "Browser project chat app thread",
      titleSource: "custom",
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content
    })
  ]
});
const browserJob = createBackgroundJobFixture({ id: "browser-run-card-job", projectId, name: "Browser run card",
  automationThreadId: "browser-run-card-thread",
  definition: { kind: "ai-routine", prompt: "Exercise run card controls." },
  schedule: { type: "one-off", runAt: now, sourceText: "manual" }, scheduleInput: "manual",
  createdAt: now, updatedAt: now });
const browserRun = createBackgroundJobRunFixture({ id: "browser-run-card-run", jobId: browserJob.id, projectId,
  automationThreadId: browserJob.automationThreadId, summary: "Browser run card summary", queuedAt: now,
  createdAt: now, updatedAt: now });
const connectionReadyEvent: ServerEvent = {
  type: "connection.ready",
  payload: {
    agents: [...defaultAgentCatalog],
    availableSkillPaths: [],
    workspace: {
      activeProjectId: project.id,
      projects: [project],
      workspaceModes: []
    },
    executionControl: createInitialExecutionControlState(),
    preferences: defaultPreferencesFixture,
    tokenUsage: createEmptyTokenUsageState(),
    setup: createInitialSetupState(),
    backgroundJobs: { ...createEmptyBackgroundJobsState(), jobs: [browserJob], runs: [browserRun] },
    assistants: createEmptyAssistantsState(),
    notifications: createEmptyNotificationInboxState()
  }
};

function FixtureWebSocket(url: string | URL) {
  const target = new EventTarget();
  const binaryType: BinaryType = "blob";
  const socket = Object.assign(target, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    binaryType,
    readyState: 0,
    url: String(url),
    send(_data: string | ArrayBufferLike | Blob | ArrayBufferView) {},
    close() {
      socket.readyState = socket.CLOSED;
      target.dispatchEvent(new CloseEvent("close"));
    },
  });
    requestAnimationFrame(() => {
      socket.readyState = socket.OPEN;
      target.dispatchEvent(new Event("open"));
      waitFrames(4, () => {
        target.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(connectionReadyEvent) }));
        waitFrames(12, () => {
          document.documentElement.dataset.testFixtureReady = "1";
        });
      });
    });
  return socket;
}

Object.assign(FixtureWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  writable: true,
  value: FixtureWebSocket
});

function waitFrames(count: number, callback: () => void) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitFrames(count - 1, callback));
}

const root = document.getElementById("root");
if (!root) throw new Error("Browser fixture root is missing");
render(
  () => (
    <UiStateProviders>
      <App />
    </UiStateProviders>
  ),
  root
);
