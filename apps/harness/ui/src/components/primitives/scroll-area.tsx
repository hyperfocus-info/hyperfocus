import { splitProps, type JSX } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { cn } from "../../lib/utils";

type ScrollAreaProps = JSX.IntrinsicElements["div"] & {
  viewportRef?: (element: HTMLDivElement) => void;
};

export function ScrollArea(props: ScrollAreaProps) {
  const [local, rest] = splitProps(props, ["class", "viewportRef", "onScroll", "onWheel"]);

  return (
    <div
      {...rest}
      ref={local.viewportRef}
      data-test-scroll-area=""
      class={cn(stylex.attrs(styles.root).class, local.class)}
      onScroll={local.onScroll}
      onWheel={local.onWheel}
    />
  );
}

const styles = stylex.create({ root: { overflow: "auto" } });
