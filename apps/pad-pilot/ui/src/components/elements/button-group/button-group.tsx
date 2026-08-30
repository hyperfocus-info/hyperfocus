import * as stylex from "@stylexjs/stylex";
import {
  Show,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
import { MoreHorizontal, X } from "lucide-solid";
import { Popover } from "@hyperfocus/ui/primitives";
import { Button, type ButtonProps } from "../button";

const styles = stylex.create({
  root: { gap: "8px", alignItems: "center", display: "flex", flexDirection: "row", position: "relative", },
  column: { alignItems: "stretch", flexDirection: "column", },
  menuPanel: {
    padding: "10px",
    borderColor: "rgba(113, 163, 199, 0.24)",
    borderRadius: "14px",
    borderStyle: "solid",
    borderWidth: "1px",
    gap: "8px",
    backgroundColor: "rgba(8, 14, 25, 0.98)",
    boxShadow: "0 14px 32px rgba(0, 0, 0, 0.28)",
    display: "flex",
    flexDirection: "column",
    minWidth: "180px",
  },
});

const ButtonGroupMenuContext = createContext<{ close: () => void }>();

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
      class={`${stylex.attrs(styles.root, local.column && styles.column).class} ${local.class ?? ""}`.trim()}
      data-column={local.column ? "true" : "false"}
    >
      <Show when={collapsed()} fallback={local.children}>
        <Popover
          ariaLabel="More actions"
          autoFocus
          contentClass={stylex.attrs(styles.menuPanel).class}
          contentRole="menu"
          open={menuOpen()}
          onOpenChange={setMenuOpen}
          onContentKeyDown={(event) => {
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
            if (items.length === 0) return;
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === "ArrowDown"
              ? (current + 1 + items.length) % items.length
              : event.key === "ArrowUp"
                ? (current - 1 + items.length) % items.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : -1;
            if (nextIndex < 0) return;
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
          trigger={(toggle) => (
            <Button
              icon={menuOpen() ? <X size={14} /> : <MoreHorizontal size={14} />}
              onClick={toggle}
              tooltip={menuOpen() ? "Close actions" : "More actions"}
            />
          )}
        >
          <ButtonGroupMenuContext.Provider value={{ close: () => setMenuOpen(false) }}>
            {local.children}
          </ButtonGroupMenuContext.Provider>
        </Popover>
      </Show>
    </div>
  );
}

/** ButtonGroup.Item renders an explicit action item for ButtonGroup. */
function ButtonGroupItem(props: ButtonGroupItemProps) {
  const menu = useContext(ButtonGroupMenuContext);
  const [local, others] = splitProps(props, ["onClick"]);

  return (
    <Button
      {...others}
      role={menu ? "menuitem" : others.role}
      onClick={(event) => {
        if (typeof local.onClick === "function") {
          local.onClick(event);
        }
        if (!event.defaultPrevented) {
          menu?.close();
        }
      }}
    />
  );
}

ButtonGroup.Item = ButtonGroupItem;
