import { mountTestUiProviders } from "../utils/tests/test-ui-providers";
import { expect, test } from "bun:test";
import { createHarnessStore, createEmptyTokenUsageState } from "../harness-store";
import type { ClientCommand } from "@hyperfocus/ai-core/protocol";

mountTestUiProviders();

test("local reset waits for matching acknowledgement; unrelated updates preserve confirmation", () => {
  const store = createHarnessStore(); const commands: ClientCommand[] = [];
  store.actions.setCommandDispatcher(command => commands.push(command));
  store.openTokenUsageResetDialog(); store.resetTokenUsage();
  const requestId = commands[0]!.requestId;
  expect(store.state.tokenUsageResetDialogOpen).toBe(true);
  expect(store.state.usageResetRequestId).toBe(requestId);
  store.applyServerEvent({ type: "usage.updated", requestId: "other", payload: { tokenUsage: createEmptyTokenUsageState() } });
  expect(store.state.tokenUsageResetDialogOpen).toBe(true);
  store.applyServerEvent({ type: "usage.updated", requestId, payload: { tokenUsage: createEmptyTokenUsageState() } });
  expect(store.state.tokenUsageResetDialogOpen).toBe(false);
  expect(store.state.usageResetRequestId).toBeUndefined();
});

test("rejected reset keeps confirmation open for retry; disconnect clears pending state", () => {
  const store = createHarnessStore(); const commands: ClientCommand[] = [];
  store.actions.setCommandDispatcher(command => commands.push(command));
  store.openTokenUsageResetDialog(); store.resetTokenUsage();
  store.applyServerEvent({ type: "command.rejected", requestId: commands[0]!.requestId, payload: { message: "Storage unavailable" } });
  expect(store.state.usageResetError).toBe("Storage unavailable");
  expect(store.state.tokenUsageResetDialogOpen).toBe(true);
  expect(store.state.usageResetRequestId).toBeUndefined();
  store.resetTokenUsage(); expect(commands).toHaveLength(2);
  store.setConnectionState("disconnected");
  expect(store.state.usageResetRequestId).toBeUndefined();
  expect(store.state.usageResetError).toContain("not acknowledged");
});

test("refresh errors are recoverable and correlated", () => {
  const store = createHarnessStore(); const commands: ClientCommand[] = [];
  store.actions.setCommandDispatcher(command => commands.push(command)); store.refreshTokenUsage();
  expect(commands[0]!.type).toBe("usage.refresh");
  store.applyServerEvent({ type: "command.rejected", requestId: commands[0]!.requestId, payload: { message: "Try again" } });
  expect(store.state.usageRefreshError).toBe("Try again");
  expect(store.state.usageRefreshRequestId).toBeUndefined();
  store.refreshTokenUsage();
  store.applyServerEvent({ type: "usage.updated", requestId: commands[1]!.requestId, payload: { tokenUsage: createEmptyTokenUsageState() } });
  expect(store.state.usageRefreshRequestId).toBeUndefined();
  expect(store.state.usageRefreshError).toBeUndefined();
});
