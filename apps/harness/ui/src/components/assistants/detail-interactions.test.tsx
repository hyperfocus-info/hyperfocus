/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { harnessStore } from "../../harness-store";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests, captureDispatchedCommands } from "../../utils/tests/store-test-utils";
import { AssistantsPanel } from "../assistants-panel";
import { seedAssistantDetailState } from "./test-state";
createUiTest("Assistant detail interactions", () => {
 beforeEach(clearBrowserStateForTests);
  it("keeps secondary assistant actions in a named menu", async () => {
    seedAssistantDetailState({ assistantId: "assistant-actions", projectId: "project-actions" });
    render(() => <AssistantsPanel variant="detail" />);
    expect(screen.queryByRole("menuitem", { name: "Delete assistant" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assistant actions" }));
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Delete assistant" })).not.toBeNull());
    expect(screen.getByRole("menuitem", { name: "Edit assistant" })).not.toBeNull();
  });

  it("explains empty todos and disables blank submission", async () => {
    seedAssistantDetailState({ assistantId: "assistant-empty-todos", projectId: "project-todos", selectedTab: "todos" });
    const commands: unknown[] = [];
    captureDispatchedCommands(commands);
    render(() => <AssistantsPanel variant="detail" />);
    expect(screen.getByText(/No todos yet/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add todo to assistant list" }).hasAttribute("disabled")).toBe(true);
    fireEvent.input(screen.getByLabelText("New todo"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Add todo to assistant list" }));
    expect(commands).toHaveLength(0);
  });

  it("distinguishes filtered learnings from an empty memory", async () => {
    seedAssistantDetailState({ assistantId: "assistant-search-memory", projectId: "project-memory", selectedTab: "learnings" });
    harnessStore.setAssistantPaneFilters({ detailSearch: "missing lesson" });
    render(() => <AssistantsPanel variant="detail" />);
    expect(screen.getByText(/No learnings match your search/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear assistant detail search" }));
    await waitFor(() => expect(screen.getByText(/No learnings yet/)).not.toBeNull());
  });

});
