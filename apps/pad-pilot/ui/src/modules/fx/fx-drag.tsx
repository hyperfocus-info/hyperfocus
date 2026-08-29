import { createDraggable, createDroppable, maybeTransformStyle } from "@thisbeyond/solid-dnd";
import { JSX } from "solid-js";
import { CARD_DRAG_INTERACTIVE_SELECTOR, shouldStartCardDrag } from "./fx-card-drag";
import styles from "./fx-console-shell.stylex";

export function bindCardDraggable(
  draggable: ReturnType<typeof createDraggable>,
  interactiveSelector = CARD_DRAG_INTERACTIVE_SELECTOR,
) {
  return {
    ref: draggable.ref,
    onPointerDown: ((event: PointerEvent & { currentTarget: HTMLElement }) => {
      if (!shouldStartCardDrag(event.target, event.currentTarget, interactiveSelector, event.pointerType)) {
        return;
      }

      draggable.dragActivators.onpointerdown?.(event);
    }) satisfies JSX.EventHandlerUnion<HTMLElement, PointerEvent>,
    style: () => maybeTransformStyle(draggable.transform),
    isActiveDraggable: () => draggable.isActiveDraggable,
  };
}

export function parseChainDragId(id: string | null | undefined) {
  if (!id?.startsWith("chain:")) {
    return null;
  }

  const [, chainId] = id.split(":");
  return chainId ? Number(chainId) : null;
}

export function parseNodeDragId(id: string | null | undefined, chainId: number) {
  if (!id?.startsWith("node:")) {
    return null;
  }

  const [, dragChainId, nodeId] = id.split(":");
  if (Number(dragChainId) !== chainId) {
    return null;
  }

  return nodeId ? Number(nodeId) : null;
}

export function FxChainDropZone(props: { chainId: number; children: JSX.Element }) {
  const droppable = createDroppable(`chain:${props.chainId}`);
  return (
    <article ref={droppable} class={styles["chain-shell"]}>
      {props.children}
    </article>
  );
}

export function FxNodeDropZone(props: { chainId: number; nodeId: number; children: JSX.Element }) {
  const droppable = createDroppable(`node:${props.chainId}:${props.nodeId}`);
  return (
    <section ref={droppable} class={styles["node-shell"]}>
      {props.children}
    </section>
  );
}

