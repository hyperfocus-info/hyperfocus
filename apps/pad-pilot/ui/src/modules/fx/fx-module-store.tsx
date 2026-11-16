import { readfxState } from "../fx/fx-chain-state";
import {
  create,
} from "@bufbuild/protobuf";
import {
  createContext,
  createMemo,
  useContext,
  type ParentProps,
} from "solid-js";
import { createStore, type SetStoreFunction } from "solid-js/store";
import { moduleSdk } from "../../module-sdk";
import {

  base64ToBytes,
} from "../../proto/base64";
import { FxModulationRouteSchema } from "../../proto/generated/fx-chain-pb";
import { PadPilot } from "../../padpilot/index";
import { fxGraph } from "../../padpilot/fx-capabilities";
import { moveItem } from "../../utils/array";
import { clamp } from "../../utils/math";
import { updateStore } from "../../utils/store";
import { createFxChainHistory } from "./fx-chain-history";
import { decodeCompactFxPresetCode } from "./fx-compact-preset";
import { generateFxIdea } from "./fx-idea-generator";
import {
  DEFAULT_FX_UI_PREFERENCES,
  type FxUiPreferences,
} from "./fx-ui-preferences";
import {
  FxNodeType,
  MAX_CHAINS,
  MAX_FX_MODULATION_ROUTES,
  cloneFxChainState,
  createChainState,
  createDefaultFxChainState,
  createEmptyVisualizerFrame,
  createMasterState,
  decodeChainPresetFile,
  decodeFxChainState,
  normalizeFxChainState,
  type FxChainState,
} from "./fx-chain-state";
import {

  mergeFxPresetSummaries,
} from "./fx-bundled-presets";
import {
  clampTimingSyncDivisionIndex,
} from "./timing-sync";
import {
  calculateFxPeakMatchedOutputGain,
  buildFxPresetItems,
} from "./fx-module-selectors";
import {
  findChainById,
  resolveSelectedChainPreset,
} from "./fx-module-state-utils";
import { installFxModuleEffects } from "./store/fx-module-effects";
import { createFxModuleStoreHelpers, type FxModuleStoreHelpers } from "./store/fx-module-store-helpers";
import type { FxModuleStateShape } from "./store/fx-module-store-contracts";
import { createFxNodeActions } from "./store/fx-node-actions";

/**
 * Owns FX editor state, host subscriptions, and grouped mutations for the module subtree.
 */
type FxActionOptions = {
  helpers: FxModuleStoreHelpers;
  setState: SetStoreFunction<FxModuleStateShape>;
  state: FxModuleStateShape;
};

function createFxChainAndPresetActions(options: FxActionOptions) {
  const { helpers, setState, state } = options;
  const {
    beginHostSyncHold,
    commitWorking,
    deleteSelectedChainPreset,
    endHostSyncHold,
    getWorkingSnapshot,
    pushToast,
    syncPreviewState,
    toggleSelectedChainPresetFavorite,
    touchMacroAutomation,
    updateWorking,
    upsertChainPreset,
  } = helpers;

  return {
    chains: {
      activate: (chainId: number) => {
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = chainId;
        });
      },
      add: () => {
        if (state.session.working.chains.length >= MAX_CHAINS) {
          pushToast("You can only have 8 FX chains.");
          return;
        }

        let nextId = 0;
        commitWorking((draft) => {
          nextId =
            draft.chains.reduce(
              (maxValue, chain) => Math.max(maxValue, chain.id),
              0
            ) + 1;
          draft.chains.push(
            createChainState(
              nextId,
              `Chain ${nextId}`,
              draft.chains.length,
              [],
              0.65
            )
          );
        });

        if (nextId > 0) {
          updateStore(setState, (draft) => {
            draft.ui.activeChainId = nextId;
            draft.ui.chainPresets.queryByChain[nextId] = "";
          });
        }
      },
      remove: (chainId: number) => {
        if (state.session.working.chains.length <= 1) {
          return;
        }

        let nextActiveChainId: number | null = null;
        commitWorking((draft) => {
          const chainIndex = draft.chains.findIndex(
            (entry) => entry.id === chainId
          );
          if (chainIndex < 0) {
            return;
          }

          draft.chains = draft.chains
            .filter((entry) => entry.id !== chainId)
            .map((entry, index) => ({ ...entry, order: index }));

          nextActiveChainId =
            draft.chains[Math.min(chainIndex, draft.chains.length - 1)]?.id ??
            draft.chains[0]?.id ??
            null;
        });

        updateStore(setState, (draft) => {
          if (draft.ui.activeChainId === chainId) {
            draft.ui.activeChainId =
              nextActiveChainId ?? draft.ui.activeChainId;
          }
          if (draft.ui.focusedNode.chainId === chainId) {
            draft.ui.focusedNode.chainId = null;
            draft.ui.focusedNode.nodeId = null;
          }
          if (draft.ui.deepEditorNode.chainId === chainId) {
            draft.ui.deepEditorNode.chainId = null;
            draft.ui.deepEditorNode.nodeId = null;
          }
          delete draft.ui.chainPresets.openByChain[chainId];
          delete draft.ui.chainPresets.queryByChain[chainId];
          delete draft.ui.chainPresets.libraryByChain[chainId];
          delete draft.ui.nodeTypeByChain[chainId];
        });
      },
      reorder: (fromId: number, toId: number) => {
        let nextIndex = -1;
        commitWorking((draft) => {
          const fromIndex = draft.chains.findIndex(
            (entry) => entry.id === fromId
          );
          const toIndex = draft.chains.findIndex((entry) => entry.id === toId);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            return;
          }

          nextIndex = toIndex;
          const nextChains = moveItem(draft.chains, fromIndex, toIndex);
          draft.chains = nextChains.map((entry, index) => ({
            ...entry,
            order: index,
          }));
        });

        if (nextIndex >= 0) {
          fxGraph.applyState(getWorkingSnapshot(), "fx");
        }
      },
      setMix: (chainId: number, value: number, commit: boolean) => {
        const interactionId = `chain-mix:${chainId}`;
        const nextValue = clamp(value, 0, 1);
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (chain) {
            chain.mix = nextValue;
          }
        });
        touchMacroAutomation(
          {
            slotIndex: 1,
            moduleId: "fx",
            chainId,
            nodeId: 0,
            controlKey: "mix",
            displayName: "Chain " + chainId + " Mix",
            valueKind: "float",
            targetKind: "fxChainMix",
            parameterId: 0,
            minValue: 0,
            maxValue: 1,
          },
          nextValue,
          commit
        );
        syncPreviewState();
        if (commit) {
          endHostSyncHold(interactionId);
        }
      },
      setNodeTypeDraft: (chainId: number, value: FxNodeType) => {
        updateStore(setState, (draft) => {
          draft.ui.nodeTypeByChain[chainId] = value;
        });
      },
      toggleMute: (chainId: number) => {
        let nextMuted: boolean | null = null;
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          chain.muted = !chain.muted;
          nextMuted = chain.muted;
        });
        if (nextMuted !== null) {
          fxGraph.applyState(getWorkingSnapshot(), "fx");
        }
      },
      toggleSolo: (chainId: number) => {
        let nextSolo: boolean | null = null;
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          chain.solo = !chain.solo;
          nextSolo = chain.solo;
        });
        if (nextSolo !== null) {
          updateStore(setState, (draft) => {
            draft.ui.activeChainId = chainId;
          });
          fxGraph.applyState(getWorkingSnapshot(), "fx");
        }
      },
    },
    chainPresets: {
      apply: (chainId: number, presetId: string) => {
        const entry = (
          state.ui.chainPresets.libraryByChain[chainId] ?? []
        ).find((item) => item.id === presetId);
        if (!entry) {
          return;
        }

        const preset = decodeChainPresetFile(
          base64ToBytes(entry.payloadBase64)
        );
        commitWorking((draft) => {
          const chainIndex = draft.chains.findIndex(
            (item) => item.id === chainId
          );
          if (chainIndex < 0 || !preset.chain) {
            return;
          }

          const existing = draft.chains[chainIndex]!;
          draft.chains[chainIndex] = {
            ...preset.chain,
            id: existing.id,
            order: existing.order,
            name: preset.chain.name || existing.name,
          };
        });
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = chainId;
          draft.ui.chainPresets.queryByChain[chainId] = entry.name;
        });
      },
      closeManager: () => {
        updateStore(setState, (draft) => {
          draft.ui.chainPresets.modalChainId = null;
        });
      },
      create: (chainId: number) => {
        upsertChainPreset(chainId, state.ui.chainPresets.draftName);
      },
      deleteSelected: deleteSelectedChainPreset,
      openManager: (chainId: number) => {
        const existingChain = findChainById(
          state.session.working.chains,
          chainId
        );
        updateStore(setState, (draft) => {
          draft.ui.chainPresets.modalChainId = chainId;
          draft.ui.chainPresets.draftName =
            draft.ui.chainPresets.queryByChain[chainId] ??
            existingChain?.name ??
            "";
        });
      },
      overwriteSelected: (chainId: number) => {
        const selected = resolveSelectedChainPreset(
          state.ui.chainPresets.libraryByChain,
          state.ui.chainPresets.queryByChain,
          chainId
        );
        upsertChainPreset(
          chainId,
          state.ui.chainPresets.draftName,
          selected?.id
        );
      },
      renameSelected: (chainId: number) => {
        const selected = resolveSelectedChainPreset(
          state.ui.chainPresets.libraryByChain,
          state.ui.chainPresets.queryByChain,
          chainId
        );
        upsertChainPreset(
          chainId,
          state.ui.chainPresets.draftName,
          selected?.id
        );
      },
      setDraftName: (value: string) => {
        updateStore(setState, (draft) => {
          draft.ui.chainPresets.draftName = value;
        });
      },
      setOpen: (chainId: number, open: boolean) => {
        updateStore(setState, (draft) => {
          draft.ui.chainPresets.openByChain[chainId] = open;
        });
      },
      setQuery: (chainId: number, value: string) => {
        updateStore(setState, (draft) => {
          draft.ui.chainPresets.queryByChain[chainId] = value;
        });
      },
      toggleFavoriteSelected: toggleSelectedChainPresetFavorite,
    },
  };
}

function createFxMasterActions(options: FxActionOptions) {
  const { helpers, state } = options;
  const {
    beginHostSyncHold,
    commitWorking,
    endHostSyncHold,
    pushToast,
    syncPreviewState,
    touchAutomationParameter,
    updateWorking,
  } = helpers;

  return {
    master: {
      matchOutputPeak: () => {
        const master = state.session.working.master ?? createMasterState();
        const nextValue = calculateFxPeakMatchedOutputGain(
          state.host.rawVisualizer.masterInputPeakDb,
          state.host.rawVisualizer.masterOutputPeakDb,
          master.outputGainDb,
        );
        if (nextValue === null) {
          pushToast("Play audio before matching peaks.");
          return;
        }
        commitWorking((draft) => {
          draft.master ??= createMasterState();
          draft.master.outputGainDb = nextValue;
        });
        touchAutomationParameter("pp.master.output_gain", nextValue, -18, 18, true);
        syncPreviewState();
      },
      setInputGain: (value: number, commit: boolean) => {
        const interactionId = "master-input-gain";
        const nextValue = clamp(value, -18, 18);
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          draft.master ??= createMasterState();
          draft.master.inputGainDb = nextValue;
        });
        touchAutomationParameter(
          "pp.master.input_gain",
          nextValue,
          -18,
          18,
          commit
        );
        syncPreviewState();
        if (commit) {
          endHostSyncHold(interactionId);
        }
      },
      setOutputGain: (value: number, commit: boolean) => {
        const interactionId = "master-output-gain";
        const nextValue = clamp(value, -18, 18);
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          draft.master ??= createMasterState();
          draft.master.outputGainDb = nextValue;
        });
        touchAutomationParameter(
          "pp.master.output_gain",
          nextValue,
          -18,
          18,
          commit
        );
        syncPreviewState();
        if (commit) {
          endHostSyncHold(interactionId);
        }
      },
      setWetDry: (value: number, commit: boolean) => {
        const interactionId = "master-wet-dry";
        const nextValue = clamp(value, 0, 1);
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          draft.master ??= createMasterState();
          draft.master.wetDry = nextValue;
        });
        touchAutomationParameter("pp.master.wet_dry", nextValue, 0, 1, commit);
        syncPreviewState();
        if (commit) {
          endHostSyncHold(interactionId);
        }
      },
    },
  };
}


function createFxModuleStore() {
  const initialState = createDefaultFxChainState();
  const [canonicalState, setCanonicalState] =
    PadPilot.hooks.useModuleState<FxChainState>("fx", initialState, readfxState);
  const moduleInteraction = PadPilot.hooks.useModuleInteraction("fx");
  const canonicalSnapshot = () =>
    normalizeFxChainState(canonicalState() ?? initialState);
  const initialSnapshot = cloneFxChainState(canonicalSnapshot());
  const [state, setState] = createStore<FxModuleStateShape>({
    session: {
      canonicalRevision: initialSnapshot.revision,
      dirty: false,
      historyVersion: 0,
      working: initialSnapshot,
    },
    host: {
      bundledPresetPayloadById: {},
      bundledPresets: [],
      displayVisualizer: createEmptyVisualizerFrame(),
      presets: [],
      rawVisualizer: createEmptyVisualizerFrame(),
      storageReady: false,
    },
    preferences: { ...DEFAULT_FX_UI_PREFERENCES },
    favorites: {
      presetIds: [],
    },
    ui: {
      activeChainId: initialSnapshot.chains[0]?.id ?? 0,
      dryCompare: false,
      chainPresets: {
        draftName: "",
        libraryByChain: {},
        modalChainId: null,
        openByChain: {},
        queryByChain: {},
      },
      compactPresetOpen: false,
      deepEditorNode: {
        chainId: null,
        nodeId: null,
      },
      focusedNode: {
        chainId: null,
        nodeId: null,
      },
      modulePreset: {
        draftName: "",
        open: false,
        query: "",
      },
      nodePresets: {
        libraryByType: {},
        openByNode: {},
        queryByNode: {},
      },
      nodeTypeByChain: {},
      preferencesModalOpen: false,
      toastQueue: [],
    },
  });
  const history = createFxChainHistory(50);
  const selectedPresetId = createMemo(
    () => state.session.working.selectedPresetId
  );
  const availablePresets = createMemo(() =>
    mergeFxPresetSummaries(state.host.bundledPresets, state.host.presets)
  );
  const presetItems = createMemo(() =>
    buildFxPresetItems(availablePresets(), state.favorites.presetIds)
  );
  const canUndo = createMemo(() => {
    state.session.historyVersion;
    return history.canUndo();
  });
  const canRedo = createMemo(() => {
    state.session.historyVersion;
    return history.canRedo();
  });
  let preferencesReturnFocus: HTMLElement | undefined;
  const helpers = createFxModuleStoreHelpers({
    canonicalSnapshot,
    history,
    moduleInteraction,
    setCanonicalState: (next) => setCanonicalState(next),
    setState,
    state,
  });
  const { commitWorking, dismissToast, getWorkingSnapshot, pushToast, replaceWorking, toggleFavoritePreset, touchHistory, updateWorking } = helpers;

  installFxModuleEffects({
    canonicalSnapshot,
    helpers,
    moduleInteraction,
    presetItems,
    selectedPresetId,
    setState,
    state,
  });

  const actions = {
    audition: {
      setDryCompare: (enabled: boolean) => {
        updateStore(setState, (draft) => {
          draft.ui.dryCompare = enabled;
        });
        fxGraph.setPreviewBypass(enabled, "fx");
      },
    },
    history: {
      canRedo,
      canUndo,
      redo: () => {
        replaceWorking(history.redo(getWorkingSnapshot()), {
          syncCanonical: true,
          touchHistory: true,
        });
      },
      undo: () => {
        replaceWorking(history.undo(getWorkingSnapshot()), {
          syncCanonical: true,
          touchHistory: true,
        });
      },
    },
    ui: {
      dismissToast,
      pushToast,
    },
    preferences: {
      closeModal: () => {
        updateStore(setState, (draft) => {
          draft.ui.preferencesModalOpen = false;
        });
        queueMicrotask(() => preferencesReturnFocus?.focus());
      },
      openModal: (returnFocus?: HTMLElement) => {
        preferencesReturnFocus = returnFocus;
        updateStore(setState, (draft) => {
          draft.ui.preferencesModalOpen = true;
        });
      },
      set: <K extends keyof FxUiPreferences>(key: K, value: FxUiPreferences[K]) => {
        updateStore(setState, (draft) => {
          draft.preferences[key] = value;
        });
      },
    },
    modulePresets: {
      applyCompact: (value: string) => {
        const decoded = decodeCompactFxPresetCode(value);
        decoded.state.selectedPresetId = "";
        history.pushSnapshot(getWorkingSnapshot());
        touchHistory();
        replaceWorking(decoded.state, { syncCanonical: true });
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = decoded.state.chains[0]?.id ?? 0;
          draft.ui.focusedNode.chainId = null;
          draft.ui.focusedNode.nodeId = null;
          draft.ui.deepEditorNode.chainId = null;
          draft.ui.deepEditorNode.nodeId = null;
        });
      },
      create: () => {
        const name = state.ui.modulePreset.draftName.trim();
        if (!name) {
          return;
        }

        fxGraph.createPreset(name, getWorkingSnapshot(), "", "fx");
        updateStore(setState, (draft) => {
          draft.ui.modulePreset.open = false;
          draft.ui.modulePreset.query = name;
          draft.ui.modulePreset.draftName = name;
        });
      },
      overwrite: () => {
        const name = state.ui.modulePreset.draftName.trim();
        const presetId = state.session.working.selectedPresetId;
        if (!name || !presetId) {
          return;
        }

        fxGraph.savePreset(name, getWorkingSnapshot(), presetId, "fx");
        updateStore(setState, (draft) => {
          draft.ui.modulePreset.open = false;
          draft.ui.modulePreset.query = name;
          draft.ui.modulePreset.draftName = name;
        });
      },
      select: (presetId: string) => {
        const bundledPayload = state.host.bundledPresetPayloadById[presetId];
        if (bundledPayload) {
          const presetState = decodeFxChainState(base64ToBytes(bundledPayload));
          history.pushSnapshot(getWorkingSnapshot());
          touchHistory();
          replaceWorking(presetState, { syncCanonical: true });
          updateStore(setState, (draft) => {
            draft.ui.activeChainId = presetState.chains[0]?.id ?? 0;
            draft.ui.focusedNode.chainId = null;
            draft.ui.focusedNode.nodeId = null;
            draft.ui.deepEditorNode.chainId = null;
            draft.ui.deepEditorNode.nodeId = null;
          });
          return;
        }

        history.pushSnapshot(getWorkingSnapshot());
        touchHistory();
        updateWorking((draft) => {
          draft.selectedPresetId = presetId;
        });
        moduleSdk.selectPreset(presetId);
      },
      setDraftName: (value: string) => {
        updateStore(setState, (draft) => {
          draft.ui.modulePreset.draftName = value;
        });
      },
      setCompactOpen: (open: boolean) => {
        updateStore(setState, (draft) => {
          draft.ui.compactPresetOpen = open;
        });
      },
      setOpen: (open: boolean) => {
        updateStore(setState, (draft) => {
          draft.ui.modulePreset.open = open;
        });
      },
      setQuery: (value: string) => {
        updateStore(setState, (draft) => {
          draft.ui.modulePreset.query = value;
        });
      },
      toggleFavorite: toggleFavoritePreset,
      toggleFavoriteSelected: () => {
        const presetId = state.session.working.selectedPresetId;
        if (presetId) {
          toggleFavoritePreset(presetId);
        }
      },
    },
    generator: {
      generate: (tags: readonly string[]) => {
        const generated = generateFxIdea(
          getWorkingSnapshot(),
          state.ui.activeChainId,
          tags,
        );
        if (!generated.name) return;
        commitWorking((draft) => {
          draft.chains = generated.state.chains;
          draft.selectedPresetId = "";
          draft.modulators = generated.state.modulators;
          draft.modulationRoutes = generated.state.modulationRoutes;
        });
        pushToast(`Generated ${generated.name}.`);
      },
    },
    modulation: {
      addRoute: (modulatorId: number, chainId: number, nodeId: number, parameterId: number, minValue: number, maxValue: number, baseValue: number) => {
        commitWorking((draft) => {
          const existing = draft.modulationRoutes.find(
            (route) => route.chainId === chainId && route.nodeId === nodeId && route.parameterId === parameterId,
          );
          if (existing) {
            existing.modulatorId = modulatorId;
            existing.enabled = true;
            existing.baseValue = baseValue;
            existing.minValue = minValue;
            existing.maxValue = maxValue;
            return;
          }
          if (draft.modulationRoutes.length >= MAX_FX_MODULATION_ROUTES) return;
          draft.modulationRoutes.push(create(FxModulationRouteSchema, {
            modulatorId,
            chainId,
            nodeId,
            parameterId,
            depth: 0.5,
            minValue,
            maxValue,
            baseValue,
            enabled: true,
          }));
        });
      },
      removeRoute: (index: number) => {
        commitWorking((draft) => {
          draft.modulationRoutes.splice(index, 1);
        });
      },
      setEnabled: (modulatorId: number, enabled: boolean) => {
        commitWorking((draft) => {
          const modulator = draft.modulators.find((entry) => entry.id === modulatorId);
          if (modulator) modulator.enabled = enabled;
        }, false);
      },
      setRate: (modulatorId: number, rateHz: number) => {
        commitWorking((draft) => {
          const modulator = draft.modulators.find((entry) => entry.id === modulatorId);
          if (modulator) modulator.rateHz = clamp(rateHz, 0.01, 20);
        }, false);
      },
      setRateSync: (modulatorId: number, enabled: boolean) => {
        commitWorking((draft) => {
          const modulator = draft.modulators.find((entry) => entry.id === modulatorId);
          if (modulator?.rateSync) modulator.rateSync.enabled = enabled;
        }, false);
      },
      setRateDivision: (modulatorId: number, divisionIndex: number) => {
        commitWorking((draft) => {
          const modulator = draft.modulators.find((entry) => entry.id === modulatorId);
          if (modulator?.rateSync) modulator.rateSync.divisionIndex = clampTimingSyncDivisionIndex(divisionIndex);
        }, false);
      },
      setRouteDepth: (index: number, depth: number) => {
        commitWorking((draft) => {
          const route = draft.modulationRoutes[index];
          if (route) route.depth = clamp(depth, -1, 1);
        }, false);
      },
      setShape: (modulatorId: number, shape: string) => {
        commitWorking((draft) => {
          const modulator = draft.modulators.find((entry) => entry.id === modulatorId);
          if (modulator) modulator.shape = shape;
        }, false);
      },
    },
    ...createFxChainAndPresetActions({ helpers, setState, state }),
    nodes: createFxNodeActions({
      helpers,
      setState,
      state,
    }),

    ...createFxMasterActions({ helpers, setState, state }),
  };

  return { actions, state };
}

export type FxModuleStore = ReturnType<typeof createFxModuleStore>;
export type FxModuleStoreState = FxModuleStore["state"];
export type FxModuleActions = FxModuleStore["actions"];

const FxModuleStateContext = createContext<FxModuleStoreState>();
const FxModuleActionsContext = createContext<FxModuleActions>();

export function FxModuleStoreProvider(props: ParentProps) {
  const store = createFxModuleStore();
  return (
    <FxModuleStateContext.Provider value={store.state}>
      <FxModuleActionsContext.Provider value={store.actions}>
        {props.children}
      </FxModuleActionsContext.Provider>
    </FxModuleStateContext.Provider>
  );
}

export function useFxModuleState() {
  const value = useContext(FxModuleStateContext);
  if (!value) {
    throw new Error(
      "useFxModuleState must be used inside FxModuleStoreProvider."
    );
  }
  return value;
}

export function useFxModuleActions() {
  const value = useContext(FxModuleActionsContext);
  if (!value) {
    throw new Error(
      "useFxModuleActions must be used inside FxModuleStoreProvider."
    );
  }
  return value;
}
