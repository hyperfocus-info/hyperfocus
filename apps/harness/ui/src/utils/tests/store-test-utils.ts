import { type ClientCommand } from "@hyperfocus/ai-core/protocol";
import { createInitialViewState, harnessStore, type HarnessViewState } from "../../harness-store";
import { resetToastStoreForTests as clearToastStore } from "../../toast-store";

export function resetHarnessStoreForTests() {
  harnessStore.replaceStateForTests(createInitialViewState());
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

export function seedHarnessStoreForTests(stateOverride: Partial<HarnessViewState>) {
  const baseState = createInitialViewState();
  harnessStore.replaceStateForTests({
    ...baseState,
    ...stateOverride,
    workspace: {
      ...baseState.workspace,
      ...stateOverride.workspace
    },
    pendingExecutionModelIds: {
      ...baseState.pendingExecutionModelIds,
      ...stateOverride.pendingExecutionModelIds
    },
    projectPreflights: {
      ...baseState.projectPreflights,
      ...stateOverride.projectPreflights
    }
  });
  harnessStore.actions.setCommandDispatcher(() => undefined);
}

export function resetToastStoreForTests() {
  clearToastStore();
}

export function clearBrowserStateForTests() {
  resetHarnessStoreForTests();
  resetToastStoreForTests();
  harnessStore.actions.setCommandDispatcher(() => undefined);

  if (typeof window !== "undefined") {
    window.localStorage.clear();
  }

  if (typeof document !== "undefined") {
    document.body.innerHTML = "";
  }

  if (typeof navigator !== "undefined" && !("clipboard" in navigator)) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });
  }
}

export function captureDispatchedCommands(commands: unknown[]): asserts commands is ClientCommand[] {
  harnessStore.actions.setCommandDispatcher((command) => {
    commands.push(command);
  });
}

export function requireCommand<TType extends ClientCommand["type"]>(commands: readonly ClientCommand[], index: number, type: TType): Extract<ClientCommand, { type: TType }> {
  const command = commands[index];
  if (!command || !isCommandType(command, type)) throw new Error(`Expected command ${type} at index ${index}`);
  return command;
}

function isCommandType<TType extends ClientCommand["type"]>(command: ClientCommand, type: TType): command is Extract<ClientCommand, { type: TType }> {
  return command.type === type;
}
