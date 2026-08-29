import { For } from "solid-js";
import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import { type AnyNodeConfig, type FxNodeControlValue, type FxNodeDefinition } from "../node-registry/types";
import { getNodeRenderers } from "../node-registry/renderer-registry";
import {
  renderFxControlField,
  resolveFxControls,
} from "./fx-control-field";
import styles from "../fx-node-registry.stylex";

export type FxNodeRackProps = {
  chainId: number;
  config: AnyNodeConfig;
  definition: FxNodeDefinition<any>;
  nodeId: number;
  nodeFrame: NodeVisualizerFrame | null;
  onControlChange: (key: string, value: string | number | boolean, commit: boolean) => void;
  visualizer: unknown;
};

function renderControlGroup<TConfig>(
  definition: FxNodeDefinition<TConfig>,
  keys: readonly string[],
  config: TConfig,
  updateControl: (key: string, value: FxNodeControlValue, commit: boolean) => void,
  chainId: number,
  nodeId: number,
) {
  const controls = resolveFxControls(definition.controls, keys);
  return (
    <div class={styles["rack-control-group"]}>
      <For each={controls}>
        {(control) => renderFxControlField(control, config, updateControl, {
          size: 44,
          testId: `node-rack-control-${chainId}-${nodeId}-${control.key}`,
        })}
      </For>
    </div>
  );
}

export function FxNodeRack(props: FxNodeRackProps) {
  const renderers = () => getNodeRenderers(props.definition.type);
  const leadingKeys = () => props.definition.rack.leadingControlKeys;
  const trailingKeys = () => props.definition.rack.trailingControlKeys ?? [];
  const renderVisualizer = () => renderers().renderVisualizer?.(props.visualizer, props.nodeFrame) ?? null;
  const renderStandardRack = () => (
    <div class={styles["rack-standard"]}>
      <div class={styles["rack-leading"]}>
        {renderControlGroup(props.definition, leadingKeys(), props.config, props.onControlChange, props.chainId, props.nodeId)}
      </div>
      <div class={styles["rack-main"]}>
        {renderVisualizer()}
      </div>
      <div class={styles["rack-trailing"]}>
        {renderControlGroup(props.definition, trailingKeys(), props.config, props.onControlChange, props.chainId, props.nodeId)}
      </div>
    </div>
  );

  return (
    <div class={styles.rack}>
      {renderers().renderRack({
        controls: props.definition.controls,
        config: props.config,
        name: props.definition.defaultName,
        nodeFrame: props.nodeFrame,
        renderStandardRack,
        updateControl: props.onControlChange,
        visualizer: props.visualizer,
      })}
    </div>
  );
}
