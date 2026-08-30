import { Show, splitProps, type JSX } from "solid-js";
import styles from "./styles/draggable-card.stylex";

/**
 * Props for DraggableCard.
 */
export type DraggableCardProps = JSX.HTMLAttributes<HTMLElement> & {
  /** Optional card title. */
  title?: string;
  /** Optional secondary text rendered below the title. */
  subtitle?: string;
  /** Optional action region rendered in the header. */
  actions?: JSX.Element;
  /** Optional card body content. */
  children?: JSX.Element;
  /** Optional fully custom header content. */
  header?: JSX.Element;
  /** Renders the shared drag handle when true. */
  dragHandle?: boolean;
  /** Applies the dragging visual state. */
  isDragging?: boolean;
  /** Applies the placeholder visual state. */
  isPlaceholder?: boolean;
  /** Visual treatment variant for the shell. */
  variant?: "default" | "node" | "chain";
  /** Pointer handler for drag activation on the card root. */
  onDragPointerDown?: JSX.EventHandlerUnion<HTMLElement, PointerEvent>;
  /** Optional root ref callback used by external drag bindings. */
  dragRef?: (element: HTMLElement) => void;
  /** Optional inline style supplied by external drag bindings. */
  dragStyle?: JSX.CSSProperties;
  /** Applies drag preview styling. */
  preview?: boolean;
};

type DraggableCardComponent = ((props: DraggableCardProps) => JSX.Element) & {
  Handle: typeof DraggableCardHandle;
};

function DragGripIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="5" cy="4" r="1.1" fill="currentColor" />
      <circle cx="11" cy="4" r="1.1" fill="currentColor" />
      <circle cx="5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="11" cy="8" r="1.1" fill="currentColor" />
      <circle cx="5" cy="12" r="1.1" fill="currentColor" />
      <circle cx="11" cy="12" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** DraggableCard renders a reusable drag-ready card shell without owning DnD provider logic. */
export function DraggableCard(props: DraggableCardProps) {
  const [local, others] = splitProps(props, [
    "actions",
    "children",
    "class",
    "classList",
    "dragHandle",
    "dragRef",
    "dragStyle",
    "header",
    "isDragging",
    "isPlaceholder",
    "onDragPointerDown",
    "preview",
    "subtitle",
    "title",
    "variant",
  ]);

  return (
    <section
      {...others}
      ref={local.dragRef}
      class={`${styles.card} ${local.isDragging ? styles["is-dragging"] : ""} ${local.isPlaceholder ? styles["is-placeholder"] : ""} ${local.preview ? styles["is-preview"] : ""} ${local.class ?? ""}`.trim()}
      classList={local.classList}
      data-variant={local.variant ?? "default"}
      style={{ ...(others.style as JSX.CSSProperties | undefined), ...(local.dragStyle ?? {}) }}
      onPointerDown={local.onDragPointerDown}
    >
      <div class={styles["card-content"]}>
        <Show when={local.header} fallback={
          <Show when={local.title || local.subtitle || local.actions || local.dragHandle}>
            <header class={styles.header}>
              <div class={styles["title-row"]}>
                <Show when={local.dragHandle}>
                  <DraggableCardHandle />
                </Show>
                <Show when={local.title || local.subtitle}>
                  <div class={styles.copy}>
                    <Show when={local.title}>
                      <strong>{local.title}</strong>
                    </Show>
                    <Show when={local.subtitle}>
                      <small class={styles["copy-small"]}>{local.subtitle}</small>
                    </Show>
                  </div>
                </Show>
              </div>
              <Show when={local.actions}>
                <div>{local.actions}</div>
              </Show>
            </header>
          </Show>
        }>
          {(header) => header()}
        </Show>
        {local.children}
      </div>
    </section>
  );
}

/** DraggableCardHandle renders the shared visible drag handle marker. */
export function DraggableCardHandle() {
  return (
    <span class={styles.handle} aria-hidden="true" data-drag-handle="true">
      <DragGripIcon />
    </span>
  );
}

(DraggableCard as DraggableCardComponent).Handle = DraggableCardHandle;
