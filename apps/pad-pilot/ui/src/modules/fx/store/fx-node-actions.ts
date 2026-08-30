import type { SetStoreFunction } from "solid-js/store";
import { base64ToBytes } from "../../../proto/base64";
import { fxGraph } from "../../../padpilot/fx-capabilities";
import { moveItem } from "../../../utils/array";
import { clamp } from "../../../utils/math";
import { updateStore } from "../../../utils/store";
import {
  FxNodeType,
  MAX_NODES_PER_CHAIN,
  NODE_LIBRARY,
  createNode,
  decodeNodePresetFile,
} from "../fx-chain-state";
import {
  findChainById,
  findNodeById,
  getDraftNodeType,
} from "../fx-module-state-utils";
import {
  findNodeControlDefinition,
  getDefaultAddNodeType,
  resolveNodeConfig,
  syncNodeLegacyParams,
} from "../node-registry/registry";
import {
  clampTimingSyncDivisionIndex,
  parseTimingSyncControlKey,
} from "../timing-sync";
import type { FxModuleStateShape } from "./fx-module-store-contracts";
import type { FxModuleStoreHelpers } from "./fx-module-store-helpers";

type FxNodeActionOptions = {
  helpers: FxModuleStoreHelpers;
  setState: SetStoreFunction<FxModuleStateShape>;
  state: FxModuleStateShape;
};

function createSetNodeControl(options: FxNodeActionOptions) {
  const { helpers, state } = options;
  const {
    beginHostSyncHold,
    commitWorking,
    endHostSyncHold,
    findLegacyParamById,
    syncPreviewState,
    touchMacroAutomation,
    updateWorking,
  } = helpers;

  return (
    chainId: number,
    nodeId: number,
    key: string,
    value: string | number | boolean,
    commit: boolean
  ) => {
    const interactionId = `node-control:${chainId}:${nodeId}:${key}`;
    const timingAction = parseTimingSyncControlKey(key);
    const currentChain = findChainById(state.session.working.chains, chainId);
    const currentNode = findNodeById(currentChain, nodeId);
    const currentControl = currentNode
      ? findNodeControlDefinition(currentNode.type, timingAction?.controlKey ?? key)
      : null;
    if (!currentNode || !currentControl) {
      if (commit) endHostSyncHold(interactionId);
      return;
    }
    if (!commit) beginHostSyncHold(interactionId);
    const apply = commit ? commitWorking : updateWorking;
    apply((draft) => {
      const chain = findChainById(draft.chains, chainId);
      const node = findNodeById(chain, nodeId);
      if (!node) return;

      const control = findNodeControlDefinition(node.type, timingAction?.controlKey ?? key);
      if (!control) return;

      const config = resolveNodeConfig(node);
      if (timingAction && control.timingSync) {
        if (timingAction.action === "enabled") {
          control.timingSync.setSyncEnabled(config as any, Boolean(value));
        } else {
          control.timingSync.setDivisionIndex(
            config as any,
            clampTimingSyncDivisionIndex(Number(value), control.timingSync.maximumDivisionIndex)
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
    const control = findNodeControlDefinition(node.type, timingAction?.controlKey ?? key);
    if (!control) {
      endHostSyncHold(interactionId);
      return;
    }
    let legacyParam = node.legacyParams.find((entry) => entry.label === control.label);
    let numericValue = Number(value);
    let displayName = `${node.name} ${control.label}`;
    let controlKey = key;
    let valueKind: "float" | "boolean" = typeof value === "boolean" ? "boolean" : "float";

    if (timingAction && control.timingSync) {
      if (timingAction.action === "enabled") {
        legacyParam = findLegacyParamById(node, control.timingSync.syncEnabledParamId);
        numericValue = Number(Boolean(value));
        displayName = `${node.name} ${control.label} Sync`;
        controlKey = `${timingAction.controlKey}.sync`;
        valueKind = "boolean";
      } else {
        legacyParam = findLegacyParamById(node, control.timingSync.syncDivisionParamId);
        numericValue = clampTimingSyncDivisionIndex(
          Number(value),
          control.timingSync.maximumDivisionIndex
        );
        displayName = `${node.name} ${control.label} Division`;
        controlKey = `${timingAction.controlKey}.division`;
        valueKind = "float";
      }
    }

    syncPreviewState();
    if (!legacyParam || !Number.isFinite(numericValue)) {
      if (commit) endHostSyncHold(interactionId);
      return;
    }
    touchMacroAutomation({
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
    }, numericValue, commit);
    if (commit) endHostSyncHold(interactionId);
  };
}

export function createFxNodeActions(options: FxNodeActionOptions) {
  const { helpers, setState, state } = options;
  const {
    beginHostSyncHold,
    commitWorking,
    endHostSyncHold,
    findLegacyParamById,
    getNodeUiKey,
    getWorkingSnapshot,
    pushToast,
    saveNodePresetEntry,
    syncPreviewState,
    touchMacroAutomation,
    updateWorking,
  } = helpers;

  return {
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

      const entry = (state.ui.nodePresets.libraryByType[node.type] ?? []).find(
        (item) => item.id === presetId
      );
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

        const fromIndex = chain.nodes.findIndex((entry) => entry.id === fromId);
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
    setControl: createSetNodeControl(options),
    setMix: (
      chainId: number,
      nodeId: number,
      value: number,
      commit: boolean
    ) => {
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
          displayName: `${node?.name ?? `Node ${nodeId}`} Mix`,
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
        draft.ui.nodePresets.queryByNode[getNodeUiKey(chainId, nodeId)] = value;
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
  };
}
