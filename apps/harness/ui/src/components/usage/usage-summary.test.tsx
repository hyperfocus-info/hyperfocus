/** @jsxImportSource solid-js */
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { UsageSummary } from "./usage-summary";
import { toastStore } from "../../toast-store";
import { HeaderActions } from "../../app/header-actions";
import { createUiTest } from "../../utils/tests/test-harness";
import { clearBrowserStateForTests } from "../../utils/tests/store-test-utils";
import { createEmptyTokenUsageState, createEmptyTokenUsageTotals, harnessStore } from "../../harness-store";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

createUiTest("Codex usage", () => {
  const setup = () => {
    clearBrowserStateForTests(); const commands: ClientCommand[] = [];
    harnessStore.actions.setCommandDispatcher(command => commands.push(command));
    return commands;
  };
  it("opens populated usage from HeaderActions, labels sources, and closes with Escape", async () => {
    const commands = setup();
    const tokenUsage = createEmptyTokenUsageState({ codexLimits: { status: "available", checkedAt: "2026-11-15T12:00:00Z", windows: [{ id: "secondary", usedPercent: 12, remainingPercent: 88, windowDurationMins: 10080, resetsAt: "2099-11-20T12:00:00Z" }] }, sources: [{ sourceKind: "planner", sourceLabel: "Planner", modelId: "codex-test", totals: createEmptyTokenUsageTotals({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 50 }) }] });
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: "seed", payload: { tokenUsage } });
    render(() => <HeaderActions executionTooltip="Pause execution" traceTooltip="Trace" />);
    const trigger = screen.getByRole("button", { name: "Open Codex usage" }); trigger.focus();
    expect(trigger.textContent).toContain("88% left");
    fireEvent.click(trigger); await Promise.resolve();
    expect(screen.getByRole("dialog", { name: "Codex usage" })).toBeTruthy();
    expect(commands[0]!.type).toBe("usage.refresh");
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: commands[0]!.requestId, payload: { tokenUsage } });
    expect(screen.getByRole("progressbar").getAttribute("value")).toBe("88");
    expect(screen.getByText("Weekly")).toBeTruthy();
    const sources = document.querySelector<HTMLDetailsElement>("[data-test-usage-sources]"); if (!sources) throw new Error("Missing usage source disclosure"); sources.open = true;
    expect(screen.getByText("Project: Unknown project")).toBeTruthy();
    expect(screen.getByText("Thread: Unknown thread")).toBeTruthy();
    expect(screen.getByText(/Role: planner/).textContent).toContain("codex-test");
    expect(screen.getByText(/Resets at/)).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" }); await Promise.resolve();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it("shows loading, unavailable, error, and empty attribution truthfully", () => {
    const commands = setup(); render(() => <UsageSummary />);
    fireEvent.click(screen.getByRole("button", { name: "Open Codex usage" }));
    expect(screen.getByText(/Loading Codex account limits/)).toBeTruthy();
    expect(screen.getByText("Account limits have not been checked.")).toBeTruthy();
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: commands[0]!.requestId, payload: { tokenUsage: createEmptyTokenUsageState({ codexLimits: { status: "unavailable", reason: "Sign in to Codex", windows: [] } }) } });
    expect(screen.getByText(/Account limits unavailable/).textContent).toContain("Sign in");
    expect(screen.getByText(/No attributed sources/)).toBeTruthy();
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: "error", payload: { tokenUsage: createEmptyTokenUsageState({ codexLimits: { status: "error", reason: "RPC unavailable", windows: [] } }) } });
    expect(screen.getByRole("alert").textContent).toContain("RPC unavailable");
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: "empty", payload: { tokenUsage: createEmptyTokenUsageState({ codexLimits: { status: "available", windows: [] } }) } });
    expect(screen.getByText("No account windows reported by Codex.")).toBeTruthy();
  });
  it("keeps aggregated sources distinct from unknown history through store updates", () => {
    setup(); render(() => <UsageSummary />);
    fireEvent.click(screen.getByRole("button", { name: "Open Codex usage" }));
    const tokenUsage = createEmptyTokenUsageState({
      lifetime: createEmptyTokenUsageTotals({ totalProcessedTokens: 250 }),
      sourceOverflow: { count: 120000, totals: createEmptyTokenUsageTotals({ inputTokens: 150, outputTokens: 50, cachedInputTokens: 100, totalProcessedTokens: 200 }) }
    });
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: "overflow", payload: { tokenUsage } });
    expect(screen.getByText("Local usage sources (120000)")).toBeTruthy();
    expect(screen.getByText(/120000 additional sources are aggregated/).textContent).toContain("Input 150; Output 50; Cached 100");
    expect(screen.getByText("Unknown attribution: 50 lifetime tokens.")).toBeTruthy();
    expect(screen.getByText("All attributed sources are included in the aggregate above.")).toBeTruthy();
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: "reset", payload: { tokenUsage: createEmptyTokenUsageState() } });
    expect(screen.queryByText(/additional sources are aggregated/)).toBeNull();
  });
  it("confirms reset, waits for acknowledgement, preserves failure and closes nested Escape first", async () => {
    const commands = setup(); render(() => <UsageSummary />);
    fireEvent.click(screen.getByRole("button", { name: "Open Codex usage" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset token usage" }));
    const confirm = screen.getByRole("button", { name: "Confirm local counter reset; account quota is unchanged" });
    fireEvent.click(confirm);
    expect(toastStore.toasts.some(toast => toast.title === "Local usage reset")).toBe(false);
    expect(screen.getByRole("dialog", { name: "Reset token usage" })).toBeTruthy();
    expect(confirm.hasAttribute("disabled")).toBe(true);
    harnessStore.applyServerEvent({ type: "command.rejected", requestId: commands[1]!.requestId, payload: { message: "Disk unavailable" } });
    expect(screen.getByRole("alert").textContent).toBe("Disk unavailable");
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);
    harnessStore.applyServerEvent({ type: "usage.updated", requestId: commands[2]!.requestId, payload: { tokenUsage: createEmptyTokenUsageState() } });
    expect(screen.queryByRole("dialog", { name: "Reset token usage" })).toBeNull();
    expect(toastStore.toasts.some(toast => toast.title === "Local usage reset")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset token usage" }));
    fireEvent.keyDown(window, { key: "Escape" }); await Promise.resolve();
    expect(screen.queryByRole("dialog", { name: "Reset token usage" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Codex usage" })).toBeTruthy();
  });
});
