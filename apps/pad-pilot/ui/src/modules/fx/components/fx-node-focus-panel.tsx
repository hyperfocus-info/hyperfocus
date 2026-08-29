import { createMemo, Show } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { getNodeDefinition, resolveNodeConfig } from "../node-registry/registry";
import { getNodeRenderers } from "../node-registry/renderer-registry";

export type FxNodeFocusPanelProps = {
  chainId: number;
  nodeId: number;
  nodeFrame: NodeVisualizerFrame | null;
  visualizer: unknown;
};

export function FxNodeFocusPanel(props: FxNodeFocusPanelProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const node = createNodeAccessor(chain, props.nodeId);
  const definition = createMemo(() => (node() ? getNodeDefinition(node()!.type) : null));
  const renderers = createMemo(() => (node() ? getNodeRenderers(node()!.type) : null));
  const open = createMemo(() => state.ui.focusedNode.chainId === props.chainId && state.ui.focusedNode.nodeId === props.nodeId);

  return (
    <Show when={node() && definition()}>
      <PadPilot.Modal
        open={open()}
        onClose={() => actions.nodes.closeFocus()}
        title={node()!.name}
        description="Expanded FX node editor"
        size="lg"
      >
        {renderers()!.renderEditor({
          controls: definition()!.controls,
          config: resolveNodeConfig(node()!),
          name: node()!.name,
          nodeFrame: props.nodeFrame,
          updateControl: (key, value, commit) => actions.nodes.setControl(props.chainId, props.nodeId, key, value, commit),
          visualizer: props.visualizer,
        })}
      </PadPilot.Modal>
    </Show>
  );
}
