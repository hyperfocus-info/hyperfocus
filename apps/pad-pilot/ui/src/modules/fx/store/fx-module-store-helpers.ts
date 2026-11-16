import type { SetStoreFunction } from "solid-js/store";
import { bytesToBase64 } from "../../../proto/base64";
import { fxGraph } from "../../../padpilot/fx-capabilities";
import { clamp } from "../../../utils/math";
import { updateStore } from "../../../utils/store";
import type { createFxChainHistory } from "../fx-chain-history";
import {
  cloneFxChainState,
  createChainPresetFile,
  createNodePresetFile,
  encodeChainPresetFile,
  encodeNodePresetFile,
  normalizeFxChainState,
  type FxChainState,
} from "../fx-chain-state";
import { findChainById, findNodeById, resolveSelectedChainPreset, sameSnapshot } from "../fx-module-state-utils";
import type { ChainPresetSummary, NodePresetSummary } from "../fx-types";
import type {
  FxModuleInteraction,
  FxModuleStateShape,
  MacroAutomationBinding,
  ReplaceWorkingOptions,
} from "./fx-module-store-contracts";

type FxModuleStoreHelperOptions = {
  canonicalSnapshot: () => FxChainState;
  history: ReturnType<typeof createFxChainHistory>;
  moduleInteraction: FxModuleInteraction;
  setCanonicalState: (next: FxChainState) => void;
  setState: SetStoreFunction<FxModuleStateShape>;
  state: FxModuleStateShape;
};

export function createFxModuleStoreHelpers(options: FxModuleStoreHelperOptions) {
  const {
    canonicalSnapshot,
    history,
    moduleInteraction,
    setCanonicalState,
    setState,
    state,
  } = options;
  let toastIdCounter = 0;
  const toastTimeouts = new Map<string, number>();
  const activeHostSyncHolds = new Set<string>();
  const activeAutomationTouches = new Set<string>();

  const getWorkingSnapshot = () =>
    cloneFxChainState(state.session.working);

  const touchHistory = () => {
    updateStore(setState, (draft) => {
      draft.session.historyVersion += 1;
    });
  };

  const replaceWorking = (
    next: FxChainState | null,
    replaceOptions: ReplaceWorkingOptions = {}
  ) => {
    if (!next) {
      return;
    }

    const snapshot = cloneFxChainState(normalizeFxChainState(next));
    if (state.ui.dryCompare) {
      fxGraph.setPreviewBypass(false, "fx");
    }
    if (replaceOptions.syncCanonical) {
      setCanonicalState(snapshot);
    }
    updateStore(setState, (draft) => {
      draft.session.working = snapshot;
      draft.session.canonicalRevision = snapshot.revision;
      draft.ui.dryCompare = false;
    });
    if (replaceOptions.touchHistory) {
      touchHistory();
    }
  };

  const updateWorking = (recipe: (draft: FxChainState) => void) => {
    updateStore(setState, (draft) => {
      recipe(draft.session.working);
    });
  };

  const commitWorking = (
    recipe: (draft: FxChainState) => void,
    pushHistory = true
  ) => {
    const currentCanonical = cloneFxChainState(canonicalSnapshot());
    const next = getWorkingSnapshot();
    recipe(next);
    const normalized = normalizeFxChainState(next);
    if (sameSnapshot(currentCanonical, normalized)) {
      return;
    }

    if (pushHistory) {
      history.pushSnapshot(currentCanonical);
      touchHistory();
    }

    normalized.revision = currentCanonical.revision + 1n;
    replaceWorking(normalized, { syncCanonical: true });
  };

  const syncPreviewState = () => {
    updateStore(setState, (draft) => {
      draft.ui.dryCompare = false;
    });
    fxGraph.setPreviewBypass(false, "fx");
    fxGraph.applyState(getWorkingSnapshot(), "fx");
  };

  const beginHostSyncHold = (interactionId: string) => {
    if (activeHostSyncHolds.has(interactionId)) {
      return;
    }

    activeHostSyncHolds.add(interactionId);
    moduleInteraction.begin();
  };

  const endHostSyncHold = (interactionId: string) => {
    if (!activeHostSyncHolds.delete(interactionId)) {
      return;
    }

    moduleInteraction.end();
  };

  const findLegacyParamById = (
    node: FxChainState["chains"][number]["nodes"][number],
    parameterId: number
  ) => node.legacyParams.find((entry) => entry.parameterId === parameterId);

  const touchAutomationParameter = (
    parameterId: string,
    value: number,
    minValue: number,
    maxValue: number,
    commit: boolean
  ) => {
    const range = Math.max(0.0001, maxValue - minValue);
    const normalizedValue = clamp((value - minValue) / range, 0, 1);
    if (!activeAutomationTouches.has(parameterId)) {
      activeAutomationTouches.add(parameterId);
      fxGraph.beginAutomationTouch(parameterId, "fx");
    }
    fxGraph.updateAutomationTouch(parameterId, normalizedValue, "fx");
    if (commit) {
      activeAutomationTouches.delete(parameterId);
      fxGraph.endAutomationTouch(parameterId, "fx");
    }
  };

  const touchMacroAutomation = (
    binding: MacroAutomationBinding,
    value: number,
    commit: boolean
  ) => {
    fxGraph.focusAutomationTarget(binding, "fx");
    touchAutomationParameter(
      "pp.macro.01",
      value,
      binding.minValue,
      binding.maxValue,
      commit
    );
  };

  const dismissToast = (toastId: string) => {
    const timeoutId = toastTimeouts.get(toastId);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      toastTimeouts.delete(toastId);
    }

    updateStore(setState, (draft) => {
      draft.ui.toastQueue = draft.ui.toastQueue.filter(
        (entry) => entry.id !== toastId
      );
    });
  };

  const pushToast = (message: string) => {
    const toastId = `fx-toast-${Date.now()}-${++toastIdCounter}`;
    updateStore(setState, (draft) => {
      draft.ui.toastQueue = [
        { id: toastId, message, tone: "error" as const },
        ...draft.ui.toastQueue,
      ].slice(0, 4);
    });

    const timeoutId = window.setTimeout(() => dismissToast(toastId), 3200);
    toastTimeouts.set(toastId, timeoutId);
    return toastId;
  };

  const toggleFavoritePreset = (presetId: string) => {
    updateStore(setState, (draft) => {
      draft.favorites.presetIds = draft.favorites.presetIds.includes(presetId)
        ? draft.favorites.presetIds.filter((id) => id !== presetId)
        : [...draft.favorites.presetIds, presetId];
    });
  };

  const upsertChainPreset = (
    chainId: number,
    name: string,
    presetId?: string
  ) => {
    const trimmed = name.trim();
    const chain = findChainById(state.session.working.chains, chainId);
    if (!chain || !trimmed) {
      return;
    }

    const payloadBase64 = bytesToBase64(
      encodeChainPresetFile(
        createChainPresetFile(trimmed, chain, presetId ?? "")
      )
    );
    const currentEntries = state.ui.chainPresets.libraryByChain[chainId] ?? [];
    const nextId = presetId ?? `${chainId}-${Date.now()}`;
    const existing = currentEntries.find((entry) => entry.id === nextId);
    const nextEntry: ChainPresetSummary = {
      favorite: existing?.favorite ?? false,
      id: nextId,
      name: trimmed,
      payloadBase64,
    };

    updateStore(setState, (draft) => {
      const entries = draft.ui.chainPresets.libraryByChain[chainId] ?? [];
      draft.ui.chainPresets.libraryByChain[chainId] = existing
        ? entries.map((entry) => (entry.id === nextId ? nextEntry : entry))
        : [...entries, nextEntry];
      draft.ui.chainPresets.queryByChain[chainId] = trimmed;
      draft.ui.chainPresets.draftName = trimmed;
      draft.ui.chainPresets.modalChainId = null;
    });
  };

  const deleteSelectedChainPreset = (chainId: number) => {
    const selected = resolveSelectedChainPreset(
      state.ui.chainPresets.libraryByChain,
      state.ui.chainPresets.queryByChain,
      chainId
    );
    if (!selected) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.ui.chainPresets.libraryByChain[chainId] = (
        draft.ui.chainPresets.libraryByChain[chainId] ?? []
      ).filter((entry) => entry.id !== selected.id);
      draft.ui.chainPresets.queryByChain[chainId] = "";
      draft.ui.chainPresets.modalChainId = null;
    });
  };

  const toggleSelectedChainPresetFavorite = (chainId: number) => {
    const selected = resolveSelectedChainPreset(
      state.ui.chainPresets.libraryByChain,
      state.ui.chainPresets.queryByChain,
      chainId
    );
    if (!selected) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.ui.chainPresets.libraryByChain[chainId] = (
        draft.ui.chainPresets.libraryByChain[chainId] ?? []
      ).map((entry) =>
        entry.id === selected.id
          ? { ...entry, favorite: !entry.favorite }
          : entry
      );
    });
  };

  const getNodeUiKey = (chainId: number, nodeId: number) =>
    `${chainId}:${nodeId}`;

  const saveNodePresetEntry = (
    chainId: number,
    nodeId: number,
    presetId?: string
  ) => {
    const chain = findChainById(state.session.working.chains, chainId);
    const node = findNodeById(chain, nodeId);
    if (!node) {
      return;
    }

    const nodeKey = getNodeUiKey(chainId, nodeId);
    const name = (
      state.ui.nodePresets.queryByNode[nodeKey] ?? node.name
    ).trim();
    if (!name) {
      return;
    }

    const payloadBase64 = bytesToBase64(
      encodeNodePresetFile(createNodePresetFile(name, node, presetId ?? ""))
    );
    const type = node.type;
    const nextId = presetId ?? `${type}-${Date.now()}`;
    const nextEntry: NodePresetSummary = {
      id: nextId,
      name,
      nodeType: type,
      payloadBase64,
    };

    updateStore(setState, (draft) => {
      const entries = draft.ui.nodePresets.libraryByType[type] ?? [];
      draft.ui.nodePresets.libraryByType[type] = entries.some(
        (entry) => entry.id === nextId
      )
        ? entries.map((entry) => (entry.id === nextId ? nextEntry : entry))
        : [...entries, nextEntry];
      draft.ui.nodePresets.queryByNode[nodeKey] = name;
    });
  };

  return {
    activeAutomationTouches,
    activeHostSyncHolds,
    beginHostSyncHold,
    commitWorking,
    deleteSelectedChainPreset,
    dismissToast,
    endHostSyncHold,
    findLegacyParamById,
    getNodeUiKey,
    getWorkingSnapshot,
    pushToast,
    replaceWorking,
    saveNodePresetEntry,
    syncPreviewState,
    toastTimeouts,
    toggleFavoritePreset,
    toggleSelectedChainPresetFavorite,
    touchAutomationParameter,
    touchHistory,
    touchMacroAutomation,
    updateWorking,
    upsertChainPreset,
  };
}

export type FxModuleStoreHelpers = ReturnType<typeof createFxModuleStoreHelpers>;
