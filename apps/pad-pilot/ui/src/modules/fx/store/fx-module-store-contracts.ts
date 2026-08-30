import type { FxUiPreferences } from "../fx-ui-preferences";
import type {
  FxChainState,
  FxNodeType,
  VisualizerFrame,
} from "../fx-chain-state";
import type {
  FxChainPresetUiState,
  FxModulePresetUiState,
  FxNodeFocusState,
  FxNodePresetUiState,
  FxToastMessage,
  PresetSummary,
} from "../fx-types";

export type FxModuleStateShape = {
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

export type ReplaceWorkingOptions = {
  syncCanonical?: boolean;
  touchHistory?: boolean;
};

export type FxModuleInteraction = {
  begin: () => void;
  end: () => void;
};

export type MacroAutomationBinding = {
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
};
