import { Show, createMemo } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import type { NodeVisualizerFrame } from "../../../proto/generated/fx-chain-pb";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { getNodeDefinition, resolveNodeConfig } from "../node-registry/registry";
import { getNodeRenderers } from "../node-registry/renderer-registry";
import styles from "./fx-inline-node-editor.stylex";

export type FxInlineNodeEditorProps = {
  chainId: number;
  nodeFrame: NodeVisualizerFrame | null;
  nodeId: number;
  visualizer: unknown;
};

/** FxInlineNodeEditor renders the active node's expanded in-rack editor surface. */
export function FxInlineNodeEditor(props: FxInlineNodeEditorProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const node = createNodeAccessor(chain, props.nodeId);
  const definition = createMemo(() => (node() ? getNodeDefinition(node()!.type) : null));
  const renderers = createMemo(() => (node() ? getNodeRenderers(node()!.type) : null));
  const open = createMemo(() => state.ui.focusedNode.chainId === props.chainId && state.ui.focusedNode.nodeId === props.nodeId);

  return (
    <Show when={open() && node() && definition()}>
      <section class={styles.editor} data-testid={`inline-node-editor-${props.chainId}-${props.nodeId}`}>
        <div class={styles["editor-header"]}>
          <div class={styles["editor-copy"]}>
            <strong class={styles["editor-copy-strong"]}>{node()!.name}</strong>
          </div>
          <div class={styles["editor-actions"]}>
            <PadPilot.Button onClick={() => actions.nodes.openDeepEditor(props.chainId, props.nodeId)} tooltip="Open the deep editor modal">
              Deep Editor
            </PadPilot.Button>
            <PadPilot.Button onClick={actions.nodes.closeFocus} tooltip="Collapse inline focus">
              Collapse
            </PadPilot.Button>
          </div>
        </div>
        <div class={styles["editor-body"]}>
          {renderers()!.renderEditor({
            controls: definition()!.controls,
            config: resolveNodeConfig(node()!),
            name: node()!.name,
            nodeFrame: props.nodeFrame,
            updateControl: (key, value, commit) => actions.nodes.setControl(props.chainId, props.nodeId, key, value, commit),
            visualizer: props.visualizer,
          })}
        </div>
      </section>
    </Show>
  );
}
