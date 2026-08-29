import type { JSX } from "solid-js";
import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import type { FxNodeControlDefinition, FxNodeControlValue } from "./types";

export type FxNodeFocusRenderProps<TConfig = any, TVisualizer = unknown> = {
  controls: FxNodeControlDefinition<TConfig>[];
  config: TConfig;
  name: string;
  nodeFrame: NodeVisualizerFrame | null;
  updateControl: (key: string, value: FxNodeControlValue, commit: boolean) => void;
  visualizer: TVisualizer | null;
};

export type FxNodeRackRenderProps<TConfig = any, TVisualizer = unknown> = {
  controls: FxNodeControlDefinition<TConfig>[];
  config: TConfig;
  name: string;
  nodeFrame: NodeVisualizerFrame | null;
  renderStandardRack: () => JSX.Element;
  updateControl: (key: string, value: FxNodeControlValue, commit: boolean) => void;
  visualizer: TVisualizer | null;
};

export type FxNodeRackVisualizerRenderer<TVisualizer = unknown> = (visualizer: TVisualizer | null, nodeFrame: NodeVisualizerFrame | null) => JSX.Element;
export type FxNodeRackRenderer<TConfig = any, TVisualizer = unknown> = (props: FxNodeRackRenderProps<TConfig, TVisualizer>) => JSX.Element;
export type FxNodeFocusRenderer<TConfig = any, TVisualizer = unknown> = (props: FxNodeFocusRenderProps<TConfig, TVisualizer>) => JSX.Element;

export type FxNodeRendererDefinition<TConfig = any, TVisualizer = unknown> = {
  renderEditor: FxNodeFocusRenderer<TConfig, TVisualizer>;
  renderRack: FxNodeRackRenderer<TConfig, TVisualizer>;
  renderVisualizer?: FxNodeRackVisualizerRenderer<TVisualizer>;
};
