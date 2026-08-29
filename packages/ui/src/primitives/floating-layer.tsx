import { Show, createEffect, createSignal, onCleanup, type Accessor, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export type FloatingLayerPlacement = "top" | "bottom" | "left" | "right";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export type FloatingLayerPosition = {
  left: number;
  maxHeight?: number;
  top: number;
  width?: number;
};

export type FloatingLayerProps = {
  anchorRect?: Accessor<DOMRectReadOnly | undefined>;
  anchorRef?: Accessor<HTMLElement | undefined>;
  children: JSX.Element;
  class?: string;
  id?: string;
  matchWidth?: boolean;
  mount?: () => HTMLElement;
  offset?: number;
  open: boolean;
  placement?: FloatingLayerPlacement;
  role?: JSX.AriaAttributes["role"];
  viewportPadding?: number;
};

function resolveVerticalPosition(anchorRect: DOMRect, layerRect: DOMRect, placement: FloatingLayerPlacement, viewportPadding: number, offset: number) {
  const spaceAbove = anchorRect.top - viewportPadding - offset;
  const spaceBelow = window.innerHeight - anchorRect.bottom - viewportPadding - offset;
  const preferAbove = placement === "top";
  const preferBelow = placement === "bottom";

  if (preferAbove && (spaceAbove >= layerRect.height || spaceAbove > spaceBelow)) {
    return {
      maxHeight: Math.max(80, spaceAbove),
      placement: "top" as const,
      top: Math.max(viewportPadding, anchorRect.top - layerRect.height - offset),
    };
  }

  if (preferBelow && (spaceBelow >= layerRect.height || spaceBelow >= spaceAbove)) {
    return {
      maxHeight: Math.max(80, spaceBelow),
      placement: "bottom" as const,
      top: Math.min(window.innerHeight - viewportPadding - layerRect.height, anchorRect.bottom + offset),
    };
  }

  if (spaceBelow >= layerRect.height || spaceBelow >= spaceAbove) {
    return {
      maxHeight: Math.max(80, spaceBelow),
      placement: "bottom" as const,
      top: Math.min(window.innerHeight - viewportPadding - layerRect.height, anchorRect.bottom + offset),
    };
  }

  return {
    maxHeight: Math.max(80, spaceAbove),
    placement: "top" as const,
    top: Math.max(viewportPadding, anchorRect.top - layerRect.height - offset),
  };
}

function resolveHorizontalPosition(anchorRect: DOMRect, layerRect: DOMRect, placement: FloatingLayerPlacement, viewportPadding: number, offset: number) {
  const spaceLeft = anchorRect.left - viewportPadding - offset;
  const spaceRight = window.innerWidth - anchorRect.right - viewportPadding - offset;
  const preferLeft = placement === "left";
  const preferRight = placement === "right";

  if (preferLeft && (spaceLeft >= layerRect.width || spaceLeft > spaceRight)) {
    return {
      left: Math.max(viewportPadding, anchorRect.left - layerRect.width - offset),
      placement: "left" as const,
      top: clamp(anchorRect.top + anchorRect.height / 2 - layerRect.height / 2, viewportPadding, window.innerHeight - viewportPadding - layerRect.height),
    };
  }

  if (preferRight && (spaceRight >= layerRect.width || spaceRight >= spaceLeft)) {
    return {
      left: Math.min(window.innerWidth - viewportPadding - layerRect.width, anchorRect.right + offset),
      placement: "right" as const,
      top: clamp(anchorRect.top + anchorRect.height / 2 - layerRect.height / 2, viewportPadding, window.innerHeight - viewportPadding - layerRect.height),
    };
  }

  if (spaceRight >= layerRect.width || spaceRight >= spaceLeft) {
    return {
      left: Math.min(window.innerWidth - viewportPadding - layerRect.width, anchorRect.right + offset),
      placement: "right" as const,
      top: clamp(anchorRect.top + anchorRect.height / 2 - layerRect.height / 2, viewportPadding, window.innerHeight - viewportPadding - layerRect.height),
    };
  }

  return {
    left: Math.max(viewportPadding, anchorRect.left - layerRect.width - offset),
    placement: "left" as const,
    top: clamp(anchorRect.top + anchorRect.height / 2 - layerRect.height / 2, viewportPadding, window.innerHeight - viewportPadding - layerRect.height),
  };
}

function resolveFloatingPosition(anchorRect: DOMRect, layerRect: DOMRect, placement: FloatingLayerPlacement, viewportPadding: number, offset: number, matchWidth: boolean) {
  if (placement === "left" || placement === "right") {
    return resolveHorizontalPosition(anchorRect, layerRect, placement, viewportPadding, offset);
  }

  const vertical = resolveVerticalPosition(anchorRect, layerRect, placement, viewportPadding, offset);
  const left = clamp(anchorRect.left + anchorRect.width / 2 - layerRect.width / 2, viewportPadding, window.innerWidth - viewportPadding - layerRect.width);
  if (matchWidth) {
    const width = Math.min(anchorRect.width, Math.max(80, window.innerWidth - viewportPadding * 2));
    return {
      left: clamp(anchorRect.left, viewportPadding, window.innerWidth - viewportPadding - width),
      maxHeight: vertical.maxHeight,
      placement: vertical.placement,
      top: vertical.top,
      width,
    };
  }
  return {
    left,
    maxHeight: vertical.maxHeight,
    placement: vertical.placement,
    top: vertical.top,
  };
}

export function FloatingLayer(props: FloatingLayerProps) {
  const [position, setPosition] = createSignal<FloatingLayerPosition>();
  let layerRef: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) {
      setPosition(undefined);
      return;
    }

    let frame = 0;
    let active = true;
    const updatePosition = () => {
      const layer = layerRef;
      const anchorRect = props.anchorRect?.() ?? props.anchorRef?.()?.getBoundingClientRect();
      if (!anchorRect || !layer) {
        return;
      }

      const layerRect = layer.getBoundingClientRect();
      const next = resolveFloatingPosition(
        anchorRect,
        layerRect,
        props.placement ?? "top",
        props.viewportPadding ?? 8,
        props.offset ?? 8,
        props.matchWidth ?? false,
      );
      setPosition(next);
    };

    const scheduleUpdate = () => {
      if (!active) {
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };

    queueMicrotask(scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    onCleanup(() => {
      active = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    });
  });

  return (
    <Show when={props.open}>
      <Portal mount={props.mount?.()}>
        <div
          ref={layerRef}
          class={props.class}
          id={props.id}
          role={props.role}
          style={{
            "left": `${position()?.left ?? -10_000}px`,
            "max-height": position()?.maxHeight ? `${position()!.maxHeight}px` : undefined,
            "position": "fixed",
            "top": `${position()?.top ?? -10_000}px`,
            "width": position()?.width ? `${position()!.width}px` : undefined,
            "z-index": "50",
          }}
        >
          {props.children}
        </div>
      </Portal>
    </Show>
  );
}
