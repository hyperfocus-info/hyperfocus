import * as stylex from "@stylexjs/stylex";
import {
  Show,
  children,
  createEffect,
  createSignal,
  onCleanup,
  splitProps,
  type JSX,
} from "solid-js";
import { Button, type ButtonProps } from "./button";

const styles = stylex.create({
  root: { gap: "8px", alignItems: "center", display: "flex", flexDirection: "row", position: "relative", },
  column: { alignItems: "stretch", flexDirection: "column", },
  menuShell: { display: "flex", position: "relative", },
  menuPanel: {
    background: "rgba(8, 14, 25, 0.98)",
    padding: "10px",
    borderColor: "rgba(113, 163, 199, 0.24)",
    borderRadius: "14px",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "8px",
    boxShadow: "0 14px 32px rgba(0, 0, 0, 0.28)",
    display: "flex",
    flexDirection: "column",
    position: "absolute",
    zIndex: 10,
    minWidth: "180px",
    right: 0,
    top: "calc(100% + 8px)",
  },
});

export type ButtonGroupProps = JSX.HTMLAttributes<HTMLDivElement> & {
  column?: boolean;
  collapseWidth?: number;
};

export type ButtonGroupItemProps = ButtonProps;

export function shouldCollapseButtonGroup(width: number, collapseWidth?: number) {
  return typeof collapseWidth === "number" && width < collapseWidth;
}

/** ButtonGroup renders a row by default and can collapse into a menu. */
export function ButtonGroup(props: ButtonGroupProps) {
  const [local, others] = splitProps(props, ["children", "class", "collapseWidth", "column"]);
  const resolvedChildren = children(() => local.children);
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [collapsed, setCollapsed] = createSignal(false);
  const [menuOpen, setMenuOpen] = createSignal(false);

  createEffect(() => {
    const element = root();
    const collapseWidth = local.collapseWidth;
    if (!element || !collapseWidth || typeof ResizeObserver === "undefined") {
      setCollapsed(false);
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      const nextCollapsed = shouldCollapseButtonGroup(entry.contentRect.width, collapseWidth);
      setCollapsed(nextCollapsed);
      if (!nextCollapsed) {
        setMenuOpen(false);
      }
    });

    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      {...others}
      ref={setRoot}
      {...stylex.attrs(styles.root, local.column && styles.column)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      data-column={local.column ? "true" : "false"}
    >
      <Show when={collapsed()} fallback={resolvedChildren()}>
        <div {...stylex.attrs(styles.menuShell)}>
          <Button
            aria-expanded={menuOpen()}
            aria-haspopup="menu"
            icon={<span aria-hidden="true">{menuOpen() ? "x" : "..."}</span>}
            onClick={() => setMenuOpen((value) => !value)}
            tooltip="More actions"
          />
          <Show when={menuOpen()}>
            <div {...stylex.attrs(styles.menuPanel)} role="menu">
              {resolvedChildren()}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** ButtonGroup.Item renders an explicit action item for ButtonGroup. */
function ButtonGroupItem(props: ButtonGroupItemProps) {
  return <Button {...props} />;
}

ButtonGroup.Item = ButtonGroupItem;
