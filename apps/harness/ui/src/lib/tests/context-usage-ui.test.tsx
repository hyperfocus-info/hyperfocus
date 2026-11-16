/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { render, screen } from "@solidjs/testing-library";
import { ChatPanel } from "../../components/chat-panel";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests, seedHarnessStoreForTests } from "../../utils/tests/store-test-utils";
import { createHarnessStateFixture, createViewProjectFixture } from "../../utils/tests/test-fixtures";

createUiTest("Context usage presentation", () => {
  it("shows unknown occupancy and a cache ratio from measured cumulative input", () => {
    clearBrowserStateForTests();
    const project = createViewProjectFixture({ contextUsage: {
      modelId: "openai/gpt-5.6-luna", contextWindow: 400000,
      inputTokens: 40105, cachedInputTokens: 29184, totalProcessedTokens: 42096,
      sourceKind: "planner", sourceLabel: "Planner", updatedAt: "2026-09-05T23:34:03.315Z"
    } });
    seedHarnessStoreForTests(createHarnessStateFixture({ experienceMode: "advanced", workspace: { activeProjectId: project.id, projects: [project] } }));
    render(() => <ChatPanel />);
    expect(screen.getByText("Current context unavailable")).toBeTruthy();
    expect(screen.getByText(/Cache Hit 73%/)).toBeTruthy();
    expect(screen.queryByText(/Cache Hit 100%/)).toBeNull();
  });
});
