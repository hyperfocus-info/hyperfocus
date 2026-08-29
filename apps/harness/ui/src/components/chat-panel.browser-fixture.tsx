/** @jsxImportSource solid-js */
import { onMount } from "solid-js";
import { render } from "solid-js/web";
import { createEmptySession } from "@hyperfocus/ai-core/protocol";
import "../global-styles";
import { createHarnessStore, harnessStore, setActiveHarnessStore } from "../harness-store";
import { createToastStoreForProvider, setActiveToastStore } from "../toast-store";
import { createHarnessStateFixture, createRunFixture, createViewProjectFixture } from "../utils/tests/test-fixtures";
import { createProjectChatBrowserMessages } from "./chat-panel.browser-data";
import { ChatPanel } from "./chat-panel";

setActiveHarnessStore(createHarnessStore());
setActiveToastStore(createToastStoreForProvider());

const threadId = "browser-project-chat-thread";
const projectId = "browser-project-chat-project";
const messages = createProjectChatBrowserMessages("browser-project-chat-message");
const fixtureRunActive = new URL(window.location.href).searchParams.get("run") === "1";
const project = createViewProjectFixture({
  id: projectId,
  activeThreadId: threadId,
  session: {
    ...createEmptySession(threadId),
    isStreaming: fixtureRunActive,
    messages
  },
  activeRun: fixtureRunActive ? createRunFixture({ id: "browser-project-chat-run", status: "running-main" }) : undefined,
  threads: [
    {
      id: threadId,
      title: "Browser project chat thread",
      kind: "user",
      titleSource: "custom",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: messages.length,
      lastMessagePreview: messages.at(-1)?.content,
      badgeState: "idle"
    }
  ]
});

harnessStore.actions.setCommandDispatcher(() => undefined);

function FixtureApp() {
  let host: HTMLDivElement | undefined;

  onMount(() => {
    requestAnimationFrame(() => {
      seedProjectChatState();
      waitFrames(8, () => {
        if (host) {
          host.style.height = `${Math.max(320, window.innerHeight - 32)}px`;
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
        width: "100vw",
        height: "100vh",
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
        <ChatPanel />
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

function seedProjectChatState() {
  const experienceMode = new URL(window.location.href).searchParams.get("mode") === "simple" ? "simple" : "advanced";
  harnessStore.replaceStateForTests(
    createHarnessStateFixture({
      connectionState: "connected",
      chatPaneTab: "chat",
      experienceMode,
      workspace: {
        activeProjectId: project.id,
        projects: [project]
      }
    })
  );
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

render(() => <FixtureApp />, document.getElementById("root")!);
