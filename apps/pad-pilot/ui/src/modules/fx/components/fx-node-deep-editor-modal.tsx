import { Show, createMemo } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { getNodeDefinition, resolveNodeConfig } from "../node-registry/registry";
import { getNodeRenderers } from "../node-registry/renderer-registry";
import styles from "./styles/fx-node-deep-editor-modal.stylex";

/** FxNodeDeepEditorModal renders the node-specific large-format modal editor. */
export function FxNodeDeepEditorModal() {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chainId = createMemo(() => state.ui.deepEditorNode.chainId);
  const nodeId = createMemo(() => state.ui.deepEditorNode.nodeId);
  const chain = createChainAccessor(() => state.session.working.chains, () => chainId() ?? -1);
  const node = createNodeAccessor(chain, () => nodeId() ?? -1);
  const definition = createMemo(() => (node() ? getNodeDefinition(node()!.type) : null));
  const renderers = createMemo(() => (node() ? getNodeRenderers(node()!.type) : null));
  const nodeFrame = createMemo(() =>
    chainId() === null || nodeId() === null
      ? null
      : state.host.displayVisualizer.nodeFrames.find((frame) => frame.chainId === chainId() && frame.nodeId === nodeId()) ?? null,
  );
  const visualizer = createMemo(() => (definition() && nodeFrame() ? definition()!.visualizer.selectPayload(nodeFrame()!) : null));

  return (
    <Show when={node() && definition()}>
      <PadPilot.Modal
        open={chainId() !== null && nodeId() !== null}
        onClose={actions.nodes.closeDeepEditor}
        title={node()!.name}
        description=""
        size="lg"
      >
        <section class={styles.editor} data-testid={`deep-node-editor-${chainId()}-${nodeId()}`}>
          <div class={styles["editor-toolbar"]}>
            <span class={styles["editor-chip"]}>Deep Editor</span>
            <PadPilot.Button onClick={actions.nodes.closeDeepEditor} tooltip="Close the deep editor">
              Close
            </PadPilot.Button>
          </div>
          <div class={styles["editor-body"]}>
            {renderers()!.renderEditor({
              controls: definition()!.controls,
              config: resolveNodeConfig(node()!),
              name: node()!.name,
              nodeFrame: nodeFrame(),
              updateControl: (key, value, commit) => actions.nodes.setControl(chainId()!, nodeId()!, key, value, commit),
              visualizer: visualizer(),
            })}
          </div>
        </section>
      </PadPilot.Modal>
    </Show>
  );
}
