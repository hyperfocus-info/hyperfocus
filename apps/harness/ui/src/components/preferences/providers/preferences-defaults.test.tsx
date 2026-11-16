/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from "bun:test";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { captureDispatchedCommands, clearBrowserStateForTests, requireCommand, seedHarnessStoreForTests } from "../../../utils/tests/store-test-utils";
import { createHarnessStateFixture, defaultPreferencesFixture } from "../../../utils/tests/test-fixtures";
import { harnessStore, readLocalPreferences } from "../../../harness-store";
import { PreferencesModal } from "../../preferences-modal";

createUiTest("AI preference ownership", () => {
  const commands: ClientCommand[] = [];
  beforeEach(() => {
    clearBrowserStateForTests(); commands.length = 0;
    seedHarnessStoreForTests(createHarnessStateFixture({ preferencesModalOpen: true,
      openAiApiKeyDraft: "openai-draft", googleApiKeyDraft: "google-draft",
      selectedReasoningStrength: "high",
      sharedAiPreferences: { version: 1 } }));
    captureDispatchedCommands(commands);
  });

  it("publishes compatible defaults while preserving unsaved keys", () => {
    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("radio", { name: "Claude" }));
    const saved = requireCommand(commands, 0, "preferences.save");
    expect(saved.payload.sharedAiPreferences).toEqual({ version: 1, providerId: "anthropic", reasoning: "high" });
    expect(saved.payload.openAiApiKey).toBeUndefined();
    expect(harnessStore.state.openAiApiKeyDraft).toBe("openai-draft");
    expect(harnessStore.state.googleApiKeyDraft).toBe("google-draft");
    expect(readLocalPreferences().openAiApiKey).toBeUndefined();
  });

  it("derives design context from tasks instead of exposing a preference", () => {
    render(() => <PreferencesModal />);
    expect(screen.queryByRole("checkbox", { name: "Hyperfocus design guidance" })).toBeNull();
  });

  it("clears only acknowledged unchanged drafts, preserving edits made in flight", () => {
    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("button", { name: "Save OpenAI API key" }));
    const saved = requireCommand(commands, 0, "preferences.save");
    harnessStore.applyServerEvent({ type: "preferences.saved", requestId: saved.requestId,
      payload: { ...defaultPreferencesFixture, hasStoredOpenAiApiKey: true, setup: harnessStore.state.setup } });
    expect(harnessStore.state.openAiApiKeyDraft).toBe("");
    expect(harnessStore.state.googleApiKeyDraft).toBe("google-draft");
    fireEvent.click(screen.getByRole("button", { name: "Save Google API key" }));
    const second = requireCommand(commands, 1, "preferences.save");
    harnessStore.setGoogleApiKeyDraft("edited-in-flight");
    harnessStore.applyServerEvent({ type: "preferences.saved", requestId: second.requestId,
      payload: { ...defaultPreferencesFixture, setup: harnessStore.state.setup } });
    expect(harnessStore.state.googleApiKeyDraft).toBe("edited-in-flight");
  });

  it("discards late connection results after editing the tested key", () => {
    render(() => <PreferencesModal />);
    fireEvent.click(screen.getByRole("button", { name: "Test OpenAI API key" }));
    const tested = requireCommand(commands, 0, "preferences.testProviderConnection");
    harnessStore.applyServerEvent({ type: "preferences.providerConnectionTested", requestId: tested.requestId,
      payload: { provider: "openai", status: "ready", message: "Original key works" } });
    expect(screen.getByText("Original key works")).not.toBeNull();
    harnessStore.setOpenAiApiKeyDraft("new-draft");
    expect(screen.queryByText("Original key works")).toBeNull();
    harnessStore.applyServerEvent({ type: "preferences.providerConnectionTested", requestId: tested.requestId,
      payload: { provider: "openai", status: "ready", message: "Old result" } });
    expect(harnessStore.state.providerConnectionTests.openai.status).toBe("idle");
    expect(screen.queryByText("Old result")).toBeNull();
  });
});
