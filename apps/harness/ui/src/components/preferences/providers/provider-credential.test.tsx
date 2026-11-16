/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { createSignal } from "solid-js";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest, requireButton, requireInput } from "../../../utils/tests/test-harness";
import { ProviderCredential } from "./provider-credential";

createUiTest("ProviderCredential", () => {
  it("keeps editing, testing, and saving separate and masks the draft by default", () => {
    let tested = 0;
    let saved = 0;
    const [draft, setDraft] = createSignal("");
    render(() => <ProviderCredential provider="openai" label="OpenAI API key" value={draft()} placeholder="sk-..."
      stored={false} test={{ status: "idle" }} onInput={setDraft} onTest={() => tested++} onSave={() => saved++} />);
    const input = requireInput(screen.getByLabelText("OpenAI API key"));
    expect(input.type).toBe("password");
    expect(requireButton(screen.getByRole("button", { name: "Test OpenAI API key" })).disabled).toBe(true);
    expect(requireButton(screen.getByRole("button", { name: "Save OpenAI API key" })).disabled).toBe(true);
    fireEvent.input(input, { target: { value: "fixture-key" } });
    expect(draft()).toBe("fixture-key");
    expect(tested).toBe(0);
    expect(saved).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Test OpenAI API key" }));
    expect(tested).toBe(1);
    expect(saved).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Save OpenAI API key" }));
    expect(saved).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Show OpenAI API key" }));
    expect(input.type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide OpenAI API key" }));
    expect(input.type).toBe("password");
  });

  it("tests a saved key without requiring its value and rejects blank replacement saves", () => {
    render(() => <ProviderCredential provider="google" label="Google API key" value="   " placeholder="AIza..."
      stored={true} test={{ status: "idle" }} onInput={() => {}} onTest={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Key saved on this machine")).not.toBeNull();
    expect(requireButton(screen.getByRole("button", { name: "Test Google API key" })).disabled).toBe(false);
    expect(requireButton(screen.getByRole("button", { name: "Save Google API key" })).disabled).toBe(true);
  });

  it("keeps unsaved state independent of test success and exposes pending and retry recovery", () => {
    const [test, setTest] = createSignal<{ status: "pending" | "failed" | "ready"; message?: string }>({ status: "pending" });
    render(() => <ProviderCredential provider="anthropic" label="Anthropic API key" value="fixture-key" placeholder="sk-ant-..."
      stored={true} test={test()} onInput={() => {}} onTest={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Replacement not saved")).not.toBeNull();
    expect(requireButton(screen.getByRole("button", { name: "Test Anthropic API key" })).disabled).toBe(true);
    expect(requireButton(screen.getByRole("button", { name: "Save Anthropic API key" })).disabled).toBe(true);
    setTest({ status: "failed", message: "Connection unavailable." });
    expect(screen.getByText("Retry test")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Check the key and connection, then retry.");
    setTest({ status: "ready", message: "Models visible." });
    expect(screen.getByText("Replacement not saved")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Save key to keep this draft.");
  });

  it("allows testing an environment-backed key without copying it into a draft", () => {
    render(() => <ProviderCredential provider="google" label="Google API key" value="" placeholder="AIza..."
      stored={false} available test={{ status: "idle" }} onInput={() => {}} onTest={() => {}} onSave={() => {}} />);
    expect(screen.getByText("Key available to runtime")).not.toBeNull();
    expect(requireButton(screen.getByRole("button", { name: "Test Google API key" })).disabled).toBe(false);
    expect(requireButton(screen.getByRole("button", { name: "Save Google API key" })).disabled).toBe(true);
  });
});
