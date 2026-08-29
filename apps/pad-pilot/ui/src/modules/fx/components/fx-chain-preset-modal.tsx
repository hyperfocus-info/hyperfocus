import { createMemo } from "solid-js";
import { resolveSelectedChainPreset } from "../fx-module-state-utils";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { FxPresetManageModal } from "./fx-preset-manage-modal";

export function FxChainPresetModal() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const modalChainId = createMemo(() => state.ui.chainPresets.modalChainId);
  const selectedPreset = createMemo(() =>
    resolveSelectedChainPreset(state.ui.chainPresets.libraryByChain, state.ui.chainPresets.queryByChain, modalChainId()),
  );

  return (
    <FxPresetManageModal
      canDelete={Boolean(modalChainId() !== null && (state.ui.chainPresets.libraryByChain[modalChainId()!] ?? []).length > 0)}
      canOverwrite={Boolean(selectedPreset())}
      favoriteLabel="Toggle favorite for the selected chain preset"
      isFavorite={Boolean(selectedPreset()?.favorite)}
      name={state.ui.chainPresets.draftName}
      onClose={actions.chainPresets.closeManager}
      onCreate={() => {
        const chainId = modalChainId();
        if (chainId !== null) {
          actions.chainPresets.create(chainId);
        }
      }}
      onDelete={() => {
        const chainId = modalChainId();
        if (chainId !== null) {
          actions.chainPresets.deleteSelected(chainId);
        }
      }}
      onNameChange={actions.chainPresets.setDraftName}
      onRename={() => {
        const chainId = modalChainId();
        if (chainId !== null) {
          actions.chainPresets.renameSelected(chainId);
        }
      }}
      onToggleFavorite={() => {
        const chainId = modalChainId();
        if (chainId !== null) {
          actions.chainPresets.toggleFavoriteSelected(chainId);
        }
      }}
      onOverwrite={() => {
        const chainId = modalChainId();
        if (chainId !== null) {
          actions.chainPresets.overwriteSelected(chainId);
        }
      }}
      open={modalChainId() !== null}
      title="Manage Chain Presets"
    />
  );
}
