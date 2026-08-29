import {
  FloatingLayer as SharedFloatingLayer,
  type FloatingLayerPosition,
  type FloatingLayerProps as SharedFloatingLayerProps,
} from "@hyperfocus/ui/primitives";
import { ensureOverlayRoot } from "./overlay-root";

export type { FloatingLayerPosition };

export type FloatingLayerProps = Omit<SharedFloatingLayerProps, "mount">;

/** Mounts shared viewport-safe floating behavior in PadPilot's overlay outlet. */
export function FloatingLayer(props: FloatingLayerProps) {
  return (
    <SharedFloatingLayer
      anchorRect={props.anchorRect}
      anchorRef={props.anchorRef}
      class={props.class}
      id={props.id}
      matchWidth={props.matchWidth}
      mount={ensureOverlayRoot}
      offset={props.offset}
      open={props.open}
      placement={props.placement}
      role={props.role}
      viewportPadding={props.viewportPadding}
    >
      {props.children}
    </SharedFloatingLayer>
  );
}
