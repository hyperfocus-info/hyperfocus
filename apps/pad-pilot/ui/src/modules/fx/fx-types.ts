export type FxPresetCategory = "creative" | "era" | "system" | "utility";

export type PresetSummary = {
  category?: FxPresetCategory;
  description?: string;
  id: string;
  intensity?: string;
  jobs?: string[];
  name: string;
  sources?: string[];
  tags?: string[];
};

export type ChainPresetSummary = {
  favorite: boolean;
  id: string;
  name: string;
  payloadBase64: string;
};

export type FxModulePresetUiState = {
  draftName: string;
  open: boolean;
  query: string;
};

export type FxChainPresetUiState = {
  draftName: string;
  libraryByChain: Record<number, ChainPresetSummary[]>;
  modalChainId: number | null;
  openByChain: Record<number, boolean>;
  queryByChain: Record<number, string>;
};

export type NodePresetSummary = {
  id: string;
  name: string;
  nodeType: number;
  payloadBase64: string;
};

export type FxNodeFocusState = {
  chainId: number | null;
  nodeId: number | null;
};

export type FxNodePresetUiState = {
  libraryByType: Record<number, NodePresetSummary[]>;
  openByNode: Record<string, boolean>;
  queryByNode: Record<string, string>;
};

export type FxToastTone = "error";

export type FxToastMessage = {
  id: string;
  message: string;
  tone: FxToastTone;
};

export type TapView = {
  inputPeakDb: number;
  inputPeakDbLeft?: number;
  inputPeakDbRight?: number;
  outputPeakDb: number;
  outputPeakDbLeft?: number;
  outputPeakDbRight?: number;
};

export type MeterVisual = {
  leftValueDb?: number;
  rightValueDb?: number;
  stereo: boolean;
  valueDb: number;
};
