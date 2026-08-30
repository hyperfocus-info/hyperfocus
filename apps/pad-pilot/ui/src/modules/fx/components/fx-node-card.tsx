import { createDraggable } from "@thisbeyond/solid-dnd";
import { Show, createMemo, type JSX } from "solid-js";
import { PadPilot } from "../../../padpilot/index";
import { CARD_DRAG_HANDLE_SELECTOR, CARD_DRAG_INTERACTIVE_SELECTOR, shouldHandleCardSurfaceAction, shouldStartCardDrag } from "../fx-card-drag";
import { FxNodeDropZone, bindCardDraggable } from "../fx-drag";
import { createChainAccessor, createNodeAccessor } from "../fx-live-accessors";
import { useFxModuleActions, useFxModuleState } from "../fx-module-store";
import { getNodeDefinition, resolveNodeConfig } from "../node-registry/registry";
import { createMeterVisual, meterDbFromMix } from "../fx-visuals";
import { FxInlineNodeEditor } from "./fx-inline-node-editor";
import { FxNodeHeader } from "./fx-node-header";
import { FxNodeRack } from "./fx-node-rack";
import shellStyles from "../styles/fx-console-shell.stylex";

export type FxNodeCardProps = {
  chainId: number;
  isPlaceholder?: boolean;
  nodeId: number;
};

/** FxNodeCard renders the compressed rack state and inline focus editor for a single FX node. */
export function FxNodeCard(props: FxNodeCardProps) {
  const state = useFxModuleState();
  const actions = useFxModuleActions();
  const chain = createChainAccessor(() => state.session.working.chains, props.chainId);
  const node = createNodeAccessor(chain, props.nodeId);
  const draggable = createDraggable(`node:${props.chainId}:${props.nodeId}`);
  const dragBinding = bindCardDraggable(draggable);
  const nodeFrame = createMemo(() => state.host.displayVisualizer.nodeFrames.find((frame) => frame.chainId === props.chainId && frame.nodeId === props.nodeId) ?? null);
  const definition = createMemo(() => (node() ? getNodeDefinition(node()!.type) : null));
  const visualizer = createMemo(() => (definition() && nodeFrame() ? definition()!.visualizer.selectPayload(nodeFrame()!) : null));
  const inputMeter = createMemo(() =>
    createMeterVisual(nodeFrame()?.inputPeakDb ?? meterDbFromMix(0.4), state.preferences.displayStereoMeters, nodeFrame()?.inputPeakDbLeft, nodeFrame()?.inputPeakDbRight),
  );
  const outputMeter = createMemo(() =>
    createMeterVisual(nodeFrame()?.outputPeakDb ?? meterDbFromMix(0.6), state.preferences.displayStereoMeters, nodeFrame()?.outputPeakDbLeft, nodeFrame()?.outputPeakDbRight),
  );
  const focused = createMemo(() => state.ui.focusedNode.chainId === props.chainId && state.ui.focusedNode.nodeId === props.nodeId);
  let surfacePointerDownAt = 0;
  const soloState = createMemo(() => {
    const currentChain = chain();
    const currentNode = node();
    if (!currentChain || !currentNode) {
      return "";
    }

    const soloIndex = currentChain.nodes.findIndex((entry) => entry.solo);
    if (soloIndex < 0) {
      return "";
    }

    const currentIndex = currentChain.nodes.findIndex((entry) => entry.id === currentNode.id);
    if (currentIndex < soloIndex) {
      return "ghosted";
    }
    if (currentIndex === soloIndex) {
      return "active";
    }
    return "darkened";
  });
  const isHandleTarget = (target: EventTarget | null) => target instanceof Element && target.closest(CARD_DRAG_HANDLE_SELECTOR) instanceof Element;
  const onNodePointerDown: JSX.EventHandlerUnion<HTMLElement, PointerEvent> = (event) => {
    const interactiveSurface = shouldHandleCardSurfaceAction(event.target, event.currentTarget, CARD_DRAG_INTERACTIVE_SELECTOR);
    surfacePointerDownAt = interactiveSurface && !isHandleTarget(event.target) ? performance.now() : 0;
    if (!shouldStartCardDrag(event.target, event.currentTarget, CARD_DRAG_INTERACTIVE_SELECTOR, event.pointerType)) {
      return;
    }

    event.stopPropagation();
    dragBinding.onPointerDown(event);
  };
  const onNodeClick: JSX.EventHandlerUnion<HTMLElement, MouseEvent> = (event) => {
    if (!shouldHandleCardSurfaceAction(event.target, event.currentTarget, CARD_DRAG_INTERACTIVE_SELECTOR) || isHandleTarget(event.target)) {
      return;
    }

    if (performance.now() - surfacePointerDownAt >= 250) {
      return;
    }

    if (focused()) {
      actions.nodes.closeFocus();
      return;
    }

    actions.nodes.openFocus(props.chainId, props.nodeId);
  };

  return (
    <Show when={node()}>
      <FxNodeDropZone chainId={props.chainId} nodeId={props.nodeId}>
        <PadPilot.DraggableCard
          dragRef={dragBinding.ref}
          dragStyle={dragBinding.style()}
          header={<FxNodeHeader chainId={props.chainId} nodeId={props.nodeId} />}
          class={`${shellStyles["node-card"]} ${node()?.bypassed ? shellStyles["is-bypassed"] : ""} ${node()?.muted ? shellStyles["is-muted"] : ""} ${soloState() === "ghosted" ? shellStyles["node-solo-ghosted"] : ""} ${soloState() === "active" ? shellStyles["node-solo-active"] : ""} ${soloState() === "darkened" ? shellStyles["node-solo-darkened"] : ""} ${focused() ? shellStyles["node-focused"] : ""}`.trim()}
          data-testid={`node-card-${props.chainId}-${props.nodeId}`}
          isDragging={dragBinding.isActiveDraggable()}
          isPlaceholder={props.isPlaceholder}
          onClick={onNodeClick}
          onDragPointerDown={onNodePointerDown}
          variant="node"
        >
          <div class={shellStyles["node-card-body"]}>
            <Show when={state.preferences.displayNodeMeters}>
              <div class={shellStyles["node-meter-column"]} data-testid={`node-meter-row-${props.chainId}-${props.nodeId}`}>
                <PadPilot.Meter
                  class={shellStyles["node-meter"]}
                  label="In"
                  leftValueDb={inputMeter().leftValueDb}
                  rightValueDb={inputMeter().rightValueDb}
                  stereo={inputMeter().stereo}
                  valueDb={inputMeter().valueDb}
                />
                <PadPilot.Meter
                  class={shellStyles["node-meter"]}
                  label="Out"
                  leftValueDb={outputMeter().leftValueDb}
                  rightValueDb={outputMeter().rightValueDb}
                  stereo={outputMeter().stereo}
                  valueDb={outputMeter().valueDb}
                />
              </div>
            </Show>
            <div class={shellStyles["node-rack-shell"]}>
              <Show when={node() && definition()}>
                <FxNodeRack
                  chainId={props.chainId}
                  nodeId={props.nodeId}
                  config={resolveNodeConfig(node()!)}
                  definition={definition()!}
                  nodeFrame={nodeFrame()}
                  onControlChange={(key, value, commit) => actions.nodes.setControl(props.chainId, props.nodeId, key, value, commit)}
                  visualizer={visualizer()}
                />
              </Show>
            </div>
          </div>

          <FxInlineNodeEditor chainId={props.chainId} nodeFrame={nodeFrame()} nodeId={props.nodeId} visualizer={visualizer()} />
        </PadPilot.DraggableCard>
      </FxNodeDropZone>
    </Show>
  );
}
