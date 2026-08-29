import {
  create,
} from "@bufbuild/protobuf";
import {
  createContext,
  createEffect,
  createMemo,
  on,
  onCleanup,
  onMount,
  useContext,
  type ParentProps,
} from "solid-js";
import { createStore } from "solid-js/store";
import { subscribeHostState } from "../../bridge";
import { moduleSdk } from "../../module-sdk";
import {
  bytesToBase64,
  base64ToBytes,
} from "../../proto/base64";
import { FxModulationRouteSchema } from "../../proto/generated/fx-chain-pb";
import { PadPilot } from "../../padpilot/index";
import { fxGraph, fxVisualizer } from "../../padpilot/fx-capabilities";
import { moveItem } from "../../utils/array";
import { clamp } from "../../utils/math";
import { updateStore } from "../../utils/store";
import { createFxChainHistory } from "./fx-chain-history";
import { decodeCompactFxPresetCode } from "./fx-compact-preset";
import { generateFxIdea } from "./fx-idea-generator";
import {
  DEFAULT_FX_UI_PREFERENCES,
  loadFxUiPreferences,
  persistFxUiPreferences,
  type FxUiPreferences,
} from "./fx-ui-preferences";
import {
  FxNodeType,
  MAX_CHAINS,
  MAX_FX_MODULATION_ROUTES,
  MAX_NODES_PER_CHAIN,
  NODE_LIBRARY,
  cloneFxChainState,
  createChainPresetFile,
  createChainState,
  createDefaultFxChainState,
  createEmptyVisualizerFrame,
  createMasterState,
  createNode,
  createNodePresetFile,
  decodeChainPresetFile,
  decodeFxChainState,
  decodeNodePresetFile,
  encodeChainPresetFile,
  encodeNodePresetFile,
  normalizeFxChainState,
  type FxChainState,
  type VisualizerFrame,
} from "./fx-chain-state";
import {
  loadBundledFxPresets,
  mergeFxPresetSummaries,
} from "./fx-bundled-presets";
import {
  findNodeControlDefinition,
  getDefaultAddNodeType,
  resolveNodeConfig,
  syncNodeLegacyParams,
} from "./node-registry/registry";
import {
  clampTimingSyncDivisionIndex,
  parseTimingSyncControlKey,
} from "./timing-sync";
import { smoothVisualizerFrame } from "./fx-visualizer-smoothing";
import {
  calculateFxPeakMatchedOutputGain,
  buildFxPresetItems,
} from "./fx-module-selectors";
import {
  findChainById,
  findNodeById,
  getDraftNodeType,
  resolveSelectedChainPreset,
  sameSnapshot,
} from "./fx-module-state-utils";
import {
  loadFavoritePresetIds,
  persistFavoritePresetIds,
} from "./fx-storage";
import {
  type ChainPresetSummary,
  type FxChainPresetUiState,
  type FxModulePresetUiState,
  type FxNodeFocusState,
  type FxNodePresetUiState,
  type FxToastMessage,
  type NodePresetSummary,
  type PresetSummary,
} from "./fx-types";

type FxModuleStateShape = {
  session: {
    canonicalRevision: bigint;
    dirty: boolean;
    historyVersion: number;
    working: FxChainState;
  };
  host: {
    bundledPresetPayloadById: Record<string, string>;
    bundledPresets: PresetSummary[];
    displayVisualizer: VisualizerFrame;
    presets: PresetSummary[];
    rawVisualizer: VisualizerFrame;
    storageReady: boolean;
  };
  preferences: FxUiPreferences;
  favorites: {
    presetIds: string[];
  };
  ui: {
    activeChainId: number;
    dryCompare: boolean;
    chainPresets: FxChainPresetUiState;
    compactPresetOpen: boolean;
    deepEditorNode: FxNodeFocusState;
    focusedNode: FxNodeFocusState;
    modulePreset: FxModulePresetUiState;
    nodePresets: FxNodePresetUiState;
    nodeTypeByChain: Record<number, FxNodeType>;
    preferencesModalOpen: boolean;
    toastQueue: FxToastMessage[];
  };
};

type ReplaceWorkingOptions = {
  syncCanonical?: boolean;
  touchHistory?: boolean;
};

/**
 * Owns FX editor state, host subscriptions, and grouped mutations for the module subtree.
 */
function createFxModuleStore() {
  const initialState = createDefaultFxChainState();
  const [canonicalState, setCanonicalState] =
    PadPilot.hooks.useModuleState<FxChainState>("fx", initialState);
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
  let visualizerFrameRequest: number | null = null;
  let lastVisualizerFrameAt = 0;
  let toastIdCounter = 0;
  const toastTimeouts = new Map<string, number>();
  const activeHostSyncHolds = new Set<string>();

  const getWorkingSnapshot = () =>
    cloneFxChainState(state.session.working as FxChainState);

  const touchHistory = () => {
    updateStore(setState, (draft) => {
      draft.session.historyVersion += 1;
    });
  };

  const replaceWorking = (
    next: FxChainState | null,
    options: ReplaceWorkingOptions = {}
  ) => {
    if (!next) {
      return;
    }

    const snapshot = cloneFxChainState(normalizeFxChainState(next));
    if (state.ui.dryCompare) {
      fxGraph.setPreviewBypass(false, "fx");
    }
    if (options.syncCanonical) {
      setCanonicalState(snapshot);
    }
    updateStore(setState, (draft) => {
      draft.session.working = snapshot;
      draft.session.canonicalRevision = snapshot.revision;
      draft.ui.dryCompare = false;
    });
    if (options.touchHistory) {
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

  const activeAutomationTouches = new Set<string>();

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
    binding: {
      slotIndex: number;
      moduleId: string;
      chainId: number;
      nodeId: number;
      controlKey: string;
      displayName: string;
      valueKind: "float" | "boolean";
      targetKind: "fxChainMix" | "fxNodeMix" | "fxNodeParamFloat";
      parameterId: number;
      minValue: number;
      maxValue: number;
    },
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

  onMount(() => {
    const bundledPresetLoad = new AbortController();
    updateStore(setState, (draft) => {
      draft.favorites.presetIds = loadFavoritePresetIds();
      draft.preferences = loadFxUiPreferences();
      draft.host.storageReady = true;
    });

    loadBundledFxPresets(fetch, bundledPresetLoad.signal)
      .then((presets) => {
        if (bundledPresetLoad.signal.aborted) {
          return;
        }
        updateStore(setState, (draft) => {
          draft.host.bundledPresets = presets.map((preset) => ({
            id: preset.id,
            name: preset.name,
            description: preset.description,
          }));
          draft.host.bundledPresetPayloadById = Object.fromEntries(
            presets.map((preset) => [preset.id, preset.payloadBase64])
          );
        });
      })
      .catch(() => undefined);
    onCleanup(() => bundledPresetLoad.abort());
  });

  createEffect(() => {
    if (!state.host.storageReady) {
      return;
    }

    persistFavoritePresetIds(state.favorites.presetIds);
  });

  createEffect(() => {
    if (!state.host.storageReady) {
      return;
    }

    persistFxUiPreferences(state.preferences);
  });

  createEffect(
    on(
      () => canonicalSnapshot(),
      (next) => {
        updateStore(setState, (draft) => {
          draft.session.canonicalRevision = next.revision;
        });

        if (!sameSnapshot(next, getWorkingSnapshot())) {
          replaceWorking(next);
        }
      }
    )
  );

  createEffect(() => {
    const nextDirty = !sameSnapshot(canonicalSnapshot(), getWorkingSnapshot());
    if (state.session.dirty === nextDirty) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.session.dirty = nextDirty;
    });
  });

  createEffect(() => {
    const selected = presetItems().find(
      (item) => item.id === selectedPresetId()
    );
    if (!selected) {
      return;
    }

    if (
      state.ui.modulePreset.open &&
      state.ui.modulePreset.query.trim().length > 0
    ) {
      return;
    }

    if (
      state.ui.modulePreset.query === selected.label &&
      state.ui.modulePreset.draftName === selected.label
    ) {
      return;
    }

    updateStore(setState, (draft) => {
      draft.ui.modulePreset.query = selected.label;
      draft.ui.modulePreset.draftName = selected.label;
    });
  });

  onMount(() => {
    const tick = (timestamp: number) => {
      const deltaMs =
        lastVisualizerFrameAt > 0 ? timestamp - lastVisualizerFrameAt : 16;
      lastVisualizerFrameAt = timestamp;
      updateStore(setState, (draft) => {
        draft.host.displayVisualizer = smoothVisualizerFrame(
          draft.host.displayVisualizer,
          draft.host.rawVisualizer,
          deltaMs
        );
      });
      visualizerFrameRequest = window.requestAnimationFrame(tick);
    };

    visualizerFrameRequest = window.requestAnimationFrame(tick);
    onCleanup(() => {
      if (visualizerFrameRequest !== null) {
        window.cancelAnimationFrame(visualizerFrameRequest);
      }

      for (let index = 0; index < activeHostSyncHolds.size; index += 1) {
        moduleInteraction.end();
      }
      activeHostSyncHolds.clear();

      for (const parameterId of activeAutomationTouches) {
        fxGraph.endAutomationTouch(parameterId, "fx");
      }
      activeAutomationTouches.clear();

      for (const timeoutId of toastTimeouts.values()) {
        window.clearTimeout(timeoutId);
      }
      toastTimeouts.clear();
    });
  });

  onMount(() => {
    const unsubscribe = subscribeHostState((hostState) => {
      const presets = hostState.presets;
      if (!presets) {
        return;
      }
      updateStore(setState, (draft) => {
        draft.host.presets = presets;
      });
    });
    const stopVisualizer = fxVisualizer.subscribe({
      onFrame: (frame) => {
        updateStore(setState, (draft) => {
          draft.host.rawVisualizer = frame;
        });
      },
    });

    onCleanup(() => {
      fxGraph.setPreviewBypass(false, "fx");
      unsubscribe();
      stopVisualizer.close();
    });
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
    nodes: {
      add: (chainId: number, nodeTypeOverride?: FxNodeType) => {
        const nextType =
          nodeTypeOverride ??
          getDraftNodeType(
            state.ui.nodeTypeByChain,
            chainId,
            getDefaultAddNodeType()
          );
        const blueprint =
          NODE_LIBRARY.find((entry) => entry.type === nextType) ??
          NODE_LIBRARY[0]!;
        let added = false;
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          if (chain.nodes.length >= MAX_NODES_PER_CHAIN) {
            return;
          }

          const nextId =
            chain.nodes.reduce(
              (maxValue, node) => Math.max(maxValue, node.id),
              0
            ) + 1;
          chain.nodes.push(createNode(blueprint, nextId, chain.nodes.length));
          added = true;
        });

        if (!added) {
          pushToast("A chain can only hold 8 FX nodes.");
        }

        return added;
      },
      applyPreset: (chainId: number, nodeId: number, presetId: string) => {
        const chain = findChainById(state.session.working.chains, chainId);
        const node = findNodeById(chain, nodeId);
        if (!node) {
          return;
        }

        const entry = (
          state.ui.nodePresets.libraryByType[node.type] ?? []
        ).find((item) => item.id === presetId);
        if (!entry) {
          return;
        }

        const preset = decodeNodePresetFile(base64ToBytes(entry.payloadBase64));
        const presetNode = preset.node;
        if (!presetNode) {
          return;
        }

        commitWorking((draft) => {
          const draftChain = findChainById(draft.chains, chainId);
          const draftNode = findNodeById(draftChain, nodeId);
          if (!draftNode) {
            return;
          }

          draftNode.type = presetNode.type;
          draftNode.name = presetNode.name || draftNode.name;
          draftNode.mix = presetNode.mix;
          draftNode.bypassed = presetNode.bypassed;
          draftNode.muted = presetNode.muted;
          draftNode.solo = false;
          draftNode.selectedPresetId = presetId;
          draftNode.config = presetNode.config as any;
          draftNode.legacyParams = presetNode.legacyParams.map((param) => ({
            ...param,
          }));
          syncNodeLegacyParams(draftNode);
        });

        updateStore(setState, (draft) => {
          draft.ui.nodePresets.queryByNode[getNodeUiKey(chainId, nodeId)] =
            entry.name;
        });
      },
      closeFocus: () => {
        updateStore(setState, (draft) => {
          draft.ui.focusedNode.chainId = null;
          draft.ui.focusedNode.nodeId = null;
        });
      },
      closeDeepEditor: () => {
        updateStore(setState, (draft) => {
          draft.ui.deepEditorNode.chainId = null;
          draft.ui.deepEditorNode.nodeId = null;
        });
      },
      deletePreset: (chainId: number, nodeId: number) => {
        const chain = findChainById(state.session.working.chains, chainId);
        const node = findNodeById(chain, nodeId);
        if (!node) {
          return;
        }

        const nodeKey = getNodeUiKey(chainId, nodeId);
        const query = state.ui.nodePresets.queryByNode[nodeKey] ?? "";
        const selected = (
          state.ui.nodePresets.libraryByType[node.type] ?? []
        ).find((entry) => entry.name === query);
        if (!selected) {
          return;
        }

        updateStore(setState, (draft) => {
          draft.ui.nodePresets.libraryByType[node.type] = (
            draft.ui.nodePresets.libraryByType[node.type] ?? []
          ).filter((entry) => entry.id !== selected.id);
          draft.ui.nodePresets.queryByNode[nodeKey] = "";
        });
      },
      openDeepEditor: (chainId: number, nodeId: number) => {
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = chainId;
          draft.ui.focusedNode.chainId = chainId;
          draft.ui.focusedNode.nodeId = nodeId;
          draft.ui.deepEditorNode.chainId = chainId;
          draft.ui.deepEditorNode.nodeId = nodeId;
        });
      },
      openFocus: (chainId: number, nodeId: number) => {
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = chainId;
          draft.ui.focusedNode.chainId = chainId;
          draft.ui.focusedNode.nodeId = nodeId;
        });
      },
      remove: (chainId: number, nodeId: number) => {
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          chain.nodes = chain.nodes
            .filter((entry) => entry.id !== nodeId)
            .map((entry, index) => ({ ...entry, order: index }));
        });
      },
      reorder: (chainId: number, fromId: number, toId: number) => {
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          const fromIndex = chain.nodes.findIndex(
            (entry) => entry.id === fromId
          );
          const toIndex = chain.nodes.findIndex((entry) => entry.id === toId);
          if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
            return;
          }

          chain.nodes = moveItem(chain.nodes, fromIndex, toIndex).map(
            (entry, index) => ({ ...entry, order: index })
          );
        });
      },
      savePreset: (chainId: number, nodeId: number) => {
        const chain = findChainById(state.session.working.chains, chainId);
        const node = findNodeById(chain, nodeId);
        if (!node) {
          return;
        }

        const nodeKey = getNodeUiKey(chainId, nodeId);
        const selected = (
          state.ui.nodePresets.libraryByType[node.type] ?? []
        ).find(
          (entry) =>
            entry.name === (state.ui.nodePresets.queryByNode[nodeKey] ?? "")
        );
        saveNodePresetEntry(chainId, nodeId, selected?.id);
      },
      setControl: (chainId: number, nodeId: number, key: string, value: string | number | boolean, commit: boolean) => {
        const interactionId = `node-control:${chainId}:${nodeId}:${key}`;
        const timingAction = parseTimingSyncControlKey(key);
        const currentChain = findChainById(state.session.working.chains, chainId);
        const currentNode = findNodeById(currentChain, nodeId);
        const currentControl = currentNode
          ? findNodeControlDefinition(currentNode.type, timingAction?.controlKey ?? key)
          : null;
        if (!currentNode || !currentControl) {
          if (commit) {
            endHostSyncHold(interactionId);
          }
          return;
        }
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          const chain = findChainById(draft.chains, chainId);
          const node = findNodeById(chain, nodeId);
          if (!node) {
            return;
          }

          const control = findNodeControlDefinition(
            node.type,
            timingAction?.controlKey ?? key
          );
          if (!control) {
            return;
          }

          const config = resolveNodeConfig(node);
          if (timingAction && control.timingSync) {
            if (timingAction.action === "enabled") {
              control.timingSync.setSyncEnabled(config as any, Boolean(value));
            } else {
              control.timingSync.setDivisionIndex(
                config as any,
                clampTimingSyncDivisionIndex(
                  Number(value),
                  control.timingSync.maximumDivisionIndex,
                )
              );
            }
          } else {
            control.setValue(config as any, value as never);
          }
          syncNodeLegacyParams(node);
        });

        const chain = findChainById(state.session.working.chains, chainId);
        const node = findNodeById(chain, nodeId);
        if (!node) {
          endHostSyncHold(interactionId);
          return;
        }
        const control = findNodeControlDefinition(
          node.type,
          timingAction?.controlKey ?? key
        );
        if (!control) {
          endHostSyncHold(interactionId);
          return;
        }
        let legacyParam = node.legacyParams.find(
          (entry) => entry.label === control.label
        );
        let numericValue =
          typeof value === "boolean" ? Number(value) : Number(value);
        let displayName = `${node.name} ${control.label}`;
        let controlKey = key;
        let valueKind: "float" | "boolean" =
          typeof value === "boolean" ? "boolean" : "float";

        if (timingAction && control.timingSync) {
          if (timingAction.action === "enabled") {
            legacyParam = findLegacyParamById(
              node,
              control.timingSync.syncEnabledParamId
            );
            numericValue = Number(Boolean(value));
            displayName = `${node.name} ${control.label} Sync`;
            controlKey = `${timingAction.controlKey}.sync`;
            valueKind = "boolean";
          } else {
            legacyParam = findLegacyParamById(
              node,
              control.timingSync.syncDivisionParamId
            );
            numericValue = clampTimingSyncDivisionIndex(
              Number(value),
              control.timingSync.maximumDivisionIndex,
            );
            displayName = `${node.name} ${control.label} Division`;
            controlKey = `${timingAction.controlKey}.division`;
            valueKind = "float";
          }
        }

        syncPreviewState();
        if (!legacyParam || !Number.isFinite(numericValue)) {
          if (commit) {
            endHostSyncHold(interactionId);
          }
          return;
        }
        touchMacroAutomation(
          {
            slotIndex: 1,
            moduleId: "fx",
            chainId,
            nodeId,
            controlKey,
            displayName,
            valueKind,
            targetKind: "fxNodeParamFloat",
            parameterId: legacyParam.parameterId,
            minValue: legacyParam.minValue,
            maxValue: legacyParam.maxValue,
          },
          numericValue,
          commit
        );
        if (commit) {
          endHostSyncHold(interactionId);
        }
      },
      setMix: (chainId: number, nodeId: number, value: number, commit: boolean) => {
        const interactionId = `node-mix:${chainId}:${nodeId}`;
        const nextValue = clamp(Number(value), 0, 1);
        if (!commit) {
          beginHostSyncHold(interactionId);
        }
        const apply = commit ? commitWorking : updateWorking;
        apply((draft) => {
          const chain = findChainById(draft.chains, chainId);
          const node = findNodeById(chain, nodeId);
          if (node) {
            node.mix = nextValue;
          }
        });
        const chain = findChainById(state.session.working.chains, chainId);
        const node = findNodeById(chain, nodeId);
        touchMacroAutomation(
          {
            slotIndex: 1,
            moduleId: "fx",
            chainId,
            nodeId,
            controlKey: "mix",
            displayName: (node?.name ?? "Node " + nodeId) + " Mix",
            valueKind: "float",
            targetKind: "fxNodeMix",
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
      setPresetOpen: (chainId: number, nodeId: number, open: boolean) => {
        updateStore(setState, (draft) => {
          draft.ui.nodePresets.openByNode[getNodeUiKey(chainId, nodeId)] = open;
        });
      },
      setPresetQuery: (chainId: number, nodeId: number, value: string) => {
        updateStore(setState, (draft) => {
          draft.ui.nodePresets.queryByNode[getNodeUiKey(chainId, nodeId)] =
            value;
        });
      },
      toggleBypass: (chainId: number, nodeId: number) => {
        let bypassed: boolean | null = null;
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          const node = findNodeById(chain, nodeId);
          if (!node) {
            return;
          }

          node.bypassed = !node.bypassed;
          bypassed = node.bypassed;
        });
        if (bypassed !== null) {
          fxGraph.applyState(getWorkingSnapshot(), "fx");
        }
      },
      toggleMute: (chainId: number, nodeId: number) => {
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          const node = findNodeById(chain, nodeId);
          if (node) {
            node.muted = !node.muted;
          }
        });
      },
      toggleSolo: (chainId: number, nodeId: number) => {
        commitWorking((draft) => {
          const chain = findChainById(draft.chains, chainId);
          if (!chain) {
            return;
          }

          const nextSolo = !(findNodeById(chain, nodeId)?.solo ?? false);
          for (const node of chain.nodes) {
            node.solo = node.id === nodeId ? nextSolo : false;
          }
        });
        updateStore(setState, (draft) => {
          draft.ui.activeChainId = chainId;
        });
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
