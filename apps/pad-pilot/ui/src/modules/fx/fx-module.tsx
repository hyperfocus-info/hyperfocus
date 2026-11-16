import { For, Show, createMemo } from "solid-js";
import { createHotkey } from "../../padpilot/hotkeys";
import { PadPilot } from "../../padpilot/index";
import styles from "./components/styles/fx-toast-viewport.stylex";
import { FxChainPresetModal } from "./components/fx-chain-preset-modal";
import { FxCompactPresetModal } from "./components/fx-compact-preset-modal";
import { FxConsoleShell } from "./components/fx-console-shell";
import { FxNodeDeepEditorModal } from "./components/fx-node-deep-editor-modal";
import { FxPreferencesModal } from "./components/fx-preferences-modal";
import { FxPresetManageModal } from "./components/fx-preset-manage-modal";
import { isTextTarget } from "./fx-module-state-utils";
import { FxModuleStoreProvider, useFxModuleActions, useFxModuleState } from "./fx-module-store";

/** PadPilot FX chain editor with protobuf-backed structural state and realtime metering. */
export function FxModule() {
  return (
    <FxModuleStoreProvider>
      <FxModuleContent />
    </FxModuleStoreProvider>
  );
}

function FxModuleContent() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();

  createHotkey("Mod+Z", (event) => {
    if (isTextTarget(event.target) || !actions.history.canUndo()) {
      return;
    }

    event.preventDefault();
    actions.history.undo();
  });

  createHotkey("Mod+Shift+Z", (event) => {
    if (isTextTarget(event.target) || !actions.history.canRedo()) {
      return;
    }

    event.preventDefault();
    actions.history.redo();
  });

  const selectedPresetId = createMemo(() => state.session.working.selectedPresetId);
  const isFavorite = createMemo(() => {
    const presetId = selectedPresetId();
    return Boolean(presetId && state.favorites.presetIds.includes(presetId));
  });

  return (
    <PadPilot.ModuleWorkspace>
      <FxConsoleShell />
      <div class={styles.viewport} aria-live="polite">
        <For each={state.ui.toastQueue}>
          {(toast) => <PadPilot.Toast class={styles["viewport-child"]} message={toast.message} onDismiss={() => actions.ui.dismissToast(toast.id)} tone={toast.tone} />}
        </For>
      </div>

      <Show when={state.ui.preferencesModalOpen}>
        <FxPreferencesModal />
      </Show>

      <FxChainPresetModal />
      <FxCompactPresetModal open={state.ui.compactPresetOpen} />
      <FxPresetManageModal
        canDelete={false}
        canOverwrite={Boolean(selectedPresetId())}
        favoriteLabel={isFavorite() ? "Remove preset from favorites" : "Add preset to favorites"}
        isFavorite={isFavorite()}
        name={state.ui.modulePreset.draftName}
        onClose={() => actions.modulePresets.setOpen(false)}
        onCreate={actions.modulePresets.create}
        onNameChange={actions.modulePresets.setDraftName}
        onRename={actions.modulePresets.overwrite}
        onToggleFavorite={actions.modulePresets.toggleFavoriteSelected}
        onOverwrite={actions.modulePresets.overwrite}
        open={state.ui.modulePreset.open}
        title="Manage Module Presets"
      />
      <FxNodeDeepEditorModal />
    </PadPilot.ModuleWorkspace>
  );
}
