import { createDraggable, createDroppable, maybeTransformStyle } from "@thisbeyond/solid-dnd";
import { JSX } from "solid-js";
import { CARD_DRAG_INTERACTIVE_SELECTOR, shouldStartCardDrag } from "./fx-card-drag";
import styles from "./styles/fx-console-shell.stylex";

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
    }),
    style: () => maybeTransformStyle(draggable.transform),
    isActiveDraggable: () => draggable.isActiveDraggable,
  };
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
