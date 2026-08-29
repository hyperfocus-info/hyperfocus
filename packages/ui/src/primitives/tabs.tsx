import * as stylex from "@stylexjs/stylex";
import {
  createContext,
  createEffect,
  createSignal,
  on,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
import { tokens } from "../theme/tokens.stylex";
import { sharedStyles } from "../theme/styles";

export type TabsActivationMode = "automatic" | "manual";
export type TabsOrientation = "horizontal" | "vertical";

export type TabsProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  activationMode?: TabsActivationMode;
  orientation?: TabsOrientation;
};

type TabsContextValue = {
  value: () => string;
  focusedValue: () => string;
  setFocusedValue: (value: string) => void;
  select: (value: string) => void;
  activationMode: () => TabsActivationMode;
  orientation: () => TabsOrientation;
  tabId: (value: string) => string;
  panelId: (value: string) => string;
};

type TabListAccessibleName =
  | { "aria-label": string; "aria-labelledby"?: never }
  | { "aria-label"?: never; "aria-labelledby": string };

export type TabListProps = Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "aria-label" | "aria-labelledby" | "onKeyDown"
> & TabListAccessibleName;

export type TabProps = Omit<
  JSX.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-controls" | "aria-selected" | "onClick" | "onFocus" | "onKeyDown" | "role" | "tabIndex" | "type"
> & {
  value: string;
};

export type TabPanelProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "role"> & {
  value: string;
};

const styles = stylex.create({
  root: {
    color: tokens.foreground,
    display: "grid",
    minHeight: 0,
    minWidth: 0,
  },
  rootHorizontal: {
    gridTemplateRows: "auto minmax(0, 1fr)",
  },
  rootVertical: {
    gridTemplateColumns: "max-content minmax(0, 1fr)",
  },
  list: {
    gap: tokens.space1,
    alignItems: "stretch",
    display: "flex",
  },
  listHorizontal: {
    flexDirection: "row",
    borderBottomColor: tokens.border,
    borderBottomStyle: "solid",
    borderBottomWidth: "1px",
  },
  listVertical: {
    flexDirection: "column",
    borderRightColor: tokens.border,
    borderRightStyle: "solid",
    borderRightWidth: "1px",
  },
  tab: {
    borderColor: "transparent",
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    paddingBlock: tokens.space2,
    paddingInline: tokens.space3,
    transition: `background-color ${tokens.motionFast} ease, color ${tokens.motionFast} ease`,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": tokens.panelRaised },
    color: { default: tokens.muted, ":hover": tokens.foreground },
    cursor: { default: "pointer", ":disabled": "not-allowed" },
    display: "inline-flex",
    fontFamily: tokens.fontUi,
    fontSize: "0.8rem",
    fontWeight: 650,
    justifyContent: "center",
    opacity: { default: 1, ":disabled": 0.48 },
    whiteSpace: "nowrap",
    minHeight: "2.25rem",
  },
  tabSelected: {
    borderColor: tokens.accent,
    backgroundColor: tokens.selection,
    color: tokens.foreground,
  },
  panel: {
    outline: { default: "none", ":focus-visible": `2px solid ${tokens.focus}` },
    outlineOffset: "-2px",
    minHeight: 0,
    minWidth: 0,
  },
});

const TabsContext = createContext<TabsContextValue>();
let tabsSequence = 0;

function useTabsContext(component: string) {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`${component} must be rendered inside Tabs.`);
  return context;
}

function idPart(value: string) {
  return encodeURIComponent(value);
}

export function Tabs(props: TabsProps) {
  const [local, rest] = splitProps(props, [
    "value",
    "onValueChange",
    "activationMode",
    "orientation",
    "children",
    "class",
    "id",
  ]);
  const generatedId = `hf-tabs-${++tabsSequence}`;
  const rootId = () => local.id ?? generatedId;
  const [focusedValue, setFocusedValue] = createSignal(local.value);

  createEffect(on(() => local.value, setFocusedValue));

  const context: TabsContextValue = {
    value: () => local.value,
    focusedValue,
    setFocusedValue,
    select: (value) => local.onValueChange(value),
    activationMode: () => local.activationMode ?? "automatic",
    orientation: () => local.orientation ?? "horizontal",
    tabId: (value) => `${rootId()}-tab-${idPart(value)}`,
    panelId: (value) => `${rootId()}-panel-${idPart(value)}`,
  };

  return (
    <TabsContext.Provider value={context}>
      <div
        {...rest}
        {...stylex.attrs(styles.root, context.orientation() === "vertical" ? styles.rootVertical : styles.rootHorizontal)}
        classList={{ [local.class ?? ""]: Boolean(local.class) }}
        id={rootId()}
        data-tabs-orientation={context.orientation()}
      >
        {local.children}
      </div>
    </TabsContext.Provider>
  );
}

function enabledTabs(list: HTMLDivElement) {
  return [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    .filter((tab) => tab.closest('[role="tablist"]') === list && !tab.disabled);
}

function setRovingTabStop(tab: HTMLButtonElement) {
  const list = tab.closest<HTMLDivElement>('[role="tablist"]');
  if (!list) return;
  for (const candidate of enabledTabs(list)) candidate.tabIndex = candidate === tab ? 0 : -1;
}

export function TabList(props: TabListProps) {
  const context = useTabsContext("TabList");
  const [local, rest] = splitProps(props, ["children", "class"]);

  const onKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (!(event.target instanceof HTMLButtonElement) || event.target.getAttribute("role") !== "tab") return;

    const tabs = enabledTabs(event.currentTarget);
    const currentIndex = tabs.indexOf(event.target);
    if (currentIndex < 0 || tabs.length === 0) return;

    let nextIndex: number | undefined;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (context.orientation() === "horizontal") {
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else {
      if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length;
      if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    if (nextIndex === undefined) return;

    event.preventDefault();
    const next = tabs[nextIndex];
    const nextValue = next.dataset.tabValue;
    if (nextValue === undefined) return;
    context.setFocusedValue(nextValue);
    setRovingTabStop(next);
    next.focus();
    if (context.activationMode() === "automatic") context.select(nextValue);
  };

  return (
    <div
      {...rest}
      {...stylex.attrs(styles.list, context.orientation() === "vertical" ? styles.listVertical : styles.listHorizontal)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      role="tablist"
      aria-orientation={context.orientation()}
      onKeyDown={onKeyDown}
    >
      {local.children}
    </div>
  );
}

export function Tab(props: TabProps) {
  const context = useTabsContext("Tab");
  const [local, rest] = splitProps(props, ["value", "children", "class", "disabled"]);
  const selected = () => context.value() === local.value;
  const focusable = () => !local.disabled && context.focusedValue() === local.value;

  const select = () => {
    if (local.disabled) return;
    context.setFocusedValue(local.value);
    context.select(local.value);
  };

  const onKeyDown: JSX.EventHandler<HTMLButtonElement, KeyboardEvent> = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select();
  };

  return (
    <button
      {...rest}
      {...stylex.attrs(styles.tab, sharedStyles.focusRing, selected() ? styles.tabSelected : undefined)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      id={context.tabId(local.value)}
      type="button"
      role="tab"
      aria-controls={context.panelId(local.value)}
      aria-selected={selected()}
      data-tab-value={local.value}
      disabled={local.disabled}
      tabIndex={focusable() ? 0 : -1}
      onClick={select}
      onFocus={(event) => {
        setRovingTabStop(event.currentTarget);
        if (!local.disabled) context.setFocusedValue(local.value);
      }}
      onKeyDown={onKeyDown}
    >
      {local.children}
    </button>
  );
}

export function TabPanel(props: TabPanelProps) {
  const context = useTabsContext("TabPanel");
  const [local, rest] = splitProps(props, ["value", "children", "class"]);
  const selected = () => context.value() === local.value;

  return (
    <div
      {...rest}
      {...stylex.attrs(styles.panel)}
      classList={{ [local.class ?? ""]: Boolean(local.class) }}
      id={context.panelId(local.value)}
      role="tabpanel"
      aria-labelledby={context.tabId(local.value)}
      tabIndex={0}
      hidden={!selected()}
    >
      {local.children}
    </div>
  );
}
