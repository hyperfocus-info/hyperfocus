import { splitProps, type JSX } from "solid-js";
import { Button, type ButtonProps } from "./button";
import styles from "./tab.stylex";

export type TabListProps = JSX.HTMLAttributes<HTMLDivElement> & {
  ariaLabel?: string;
};

export type TabProps = Omit<ButtonProps, "variant"> & {
  leading?: JSX.Element;
  selected: boolean;
  trailing?: JSX.Element;
};

function getTabElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
}

function moveFocus(current: HTMLElement, delta: number) {
  const list = current.closest('[role="tablist"]');
  if (!(list instanceof HTMLElement)) {
    return;
  }

  const tabs = getTabElements(list);
  if (tabs.length === 0) {
    return;
  }

  const currentIndex = tabs.indexOf(current as HTMLButtonElement);
  if (currentIndex < 0) {
    return;
  }

  const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
  tabs[nextIndex]?.focus();
  tabs[nextIndex]?.click();
}

export function TabList(props: TabListProps) {
  const [local, others] = splitProps(props, ["ariaLabel", "children", "class"]);

  return (
    <div {...others} class={`${styles["tab-list"]} ${local.class ?? ""}`.trim()} role="tablist" aria-label={local.ariaLabel}>
      {local.children}
    </div>
  );
}

export function Tab(props: TabProps) {
  const [local, others] = splitProps(props, ["children", "leading", "selected", "trailing"]);

  return (
    <Button
      {...others}
      variant="tab"
      class={`${styles.tab} ${others.class ?? ""}`.trim()}
      role="tab"
      aria-selected={local.selected}
      tabIndex={local.selected ? 0 : -1}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveFocus(event.currentTarget, 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveFocus(event.currentTarget, -1);
        } else if (event.key === "Home") {
          event.preventDefault();
          const first = getTabElements(event.currentTarget.closest('[role="tablist"]') as HTMLElement)[0];
          first?.focus();
          first?.click();
        } else if (event.key === "End") {
          event.preventDefault();
          const tabs = getTabElements(event.currentTarget.closest('[role="tablist"]') as HTMLElement);
          const last = tabs[tabs.length - 1];
          last?.focus();
          last?.click();
        }

        if (typeof others.onKeyDown === "function") {
          others.onKeyDown(event);
        }
      }}
    >
      {local.leading}
      {local.children}
      {local.trailing}
    </Button>
  );
}
