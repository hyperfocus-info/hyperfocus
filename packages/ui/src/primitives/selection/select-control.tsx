import * as stylex from "@stylexjs/stylex";
import { For, Show, createMemo, createSignal, createUniqueId, type JSX } from "solid-js";
import { sharedStyles } from "../../theme/styles";
import { tokens } from "../../theme/tokens.stylex";
import { Popover, type PopoverState } from "../popover";
import { Tooltip } from "../tooltip";
import { Button } from "../button";

export type SelectOption<Value extends string = string> = {
  value: Value;
  label: string;
  description?: string;
  icon?: JSX.Element;
  disabled?: boolean;
  keywords?: readonly string[];
  tags?: readonly string[];
};

export type SelectTag = {
  id: string;
  label: string;
};

export type SelectControlProps<Value extends string = string> = {
  ariaLabel: string;
  value: Value;
  options: readonly SelectOption<Value>[];
  onChange: (value: Value) => void;
  /** Delegated command hosts may read the request during the bubbling change
   * event. Outside dispatch, DOM metadata always reflects the accepted value. */
  changeEventValue?: "accepted" | "requested";
  icon?: JSX.Element;
  placeholder?: string;
  tooltip?: string | false;
  disabled?: boolean;
  hideWhenSingleOption?: boolean;
  size?: "sm" | "md";
  class?: string;
  contentClass?: string;
  dataAttributes?: Readonly<Record<string, string>>;
  describedBy?: string;
  invalid?: boolean;
  placement?: "top" | "bottom";
  align?: "start" | "center" | "end";
  searchable?: boolean;
  searchThreshold?: number;
  searchPlaceholder?: string;
  tags?: readonly SelectTag[];
  loading?: boolean;
  emptyMessage?: string;
  onSearch?: (query: string) => void;
  /** Opens a host-owned creation flow; it never accepts the query as a value. */
  onCreate?: (query: string) => void;
  createLabel?: string;
  /** Interactive option actions use grid semantics instead of nesting buttons in an option. */
  optionAction?: (option: () => SelectOption<Value>) => JSX.Element;
};

const styles = stylex.create({
  root: { display: "inline-flex", maxWidth: "100%", minWidth: 0, width: "100%" },
  fill: { maxWidth: "100%", minWidth: 0, width: "100%" },
  trigger: {
    borderColor: { default: tokens.border, ':is([aria-invalid="true"])': tokens.danger },
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    gap: tokens.space2,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: { default: tokens.panelRaised, ":hover": tokens.selection },
    color: tokens.foreground,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: tokens.fontUi,
    fontWeight: 400,
    justifyContent: "flex-start",
    opacity: { default: 1, ":disabled": 0.48 },
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  triggerSmall: { fontSize: tokens.fontControl, minHeight: { default: tokens.controlCompact, "@media (pointer: coarse)": tokens.controlTouch } },
  triggerMedium: { fontSize: tokens.fontControl, minHeight: { default: tokens.controlStandard, "@media (pointer: coarse)": tokens.controlTouch } },
  triggerIcon: { alignItems: "center", color: tokens.muted, display: "inline-flex", flexShrink: 0, justifyContent: "center" },
  triggerLabel: { flex: "1", overflow: "hidden", textAlign: "start", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 },
  chevron: { color: tokens.muted, flexShrink: 0, height: "0.9rem", width: "0.9rem" },
  content: {
    padding: tokens.space2,
    gap: tokens.space2,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    maxHeight: "calc(100dvh - 1rem)",
    maxWidth: "calc(100vw - 1rem)",
    minWidth: "min(18rem, calc(100vw - 1rem))",
    width: "min(22rem, calc(100vw - 1rem))",
  },
  search: {
    borderColor: tokens.border,
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    outline: { default: "none", ":focus": `2px solid ${tokens.focus}` },
    paddingInline: tokens.space3,
    backgroundColor: tokens.panelRaised,
    color: tokens.foreground,
    flexShrink: 0,
    fontFamily: tokens.fontUi,
    fontWeight: 400,
    minHeight: { default: "2.5rem", "@media (pointer: coarse)": "2.75rem" },
    width: "100%",
  },
  tags: { gap: tokens.space1, display: "flex", flexShrink: 0, paddingBlockEnd: tokens.space1, overflowX: "auto", },
  tag: {
    borderColor: tokens.border,
    borderRadius: "999px",
    borderStyle: "solid",
    borderWidth: "1px",
    paddingInline: tokens.space2,
    backgroundColor: "transparent",
    color: tokens.muted,
    cursor: "pointer",
    flexShrink: 0,
    fontFamily: tokens.fontUi,
    fontSize: tokens.fontCaption,
    minHeight: { default: "1.75rem", "@media (pointer: coarse)": "2.75rem" },
  },
  activeTag: { borderColor: tokens.accent, backgroundColor: tokens.selection, color: tokens.foreground },
  options: { gap: tokens.space1, overscrollBehavior: "contain", alignContent: "start", display: "grid", flexBasis: "auto", flexGrow: 1, flexShrink: 1, gridAutoRows: "max-content", minHeight: 0, overflowY: "auto", },
  option: {
    borderColor: "transparent",
    borderRadius: tokens.radiusSmall,
    borderStyle: "solid",
    borderWidth: "1px",
    gap: tokens.space2,
    paddingBlock: tokens.space2,
    paddingInline: tokens.space2,
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": `color-mix(in srgb, ${tokens.selection} 50%, ${tokens.panelRaised})`, ":focus": `color-mix(in srgb, ${tokens.selection} 50%, ${tokens.panelRaised})` },
    color: tokens.foreground,
    cursor: "pointer",
    display: "grid",
    fontFamily: tokens.fontUi,
    gridTemplateColumns: "1rem minmax(0, 1fr) 1rem",
    opacity: { default: 1, ":disabled": 0.48 },
    textAlign: "start",
    minHeight: { default: "2.5rem", "@media (pointer: coarse)": "2.75rem" },
    width: "100%",
  },
  selectedOption: { backgroundColor: tokens.selection },
  optionIcon: { alignItems: "center", color: tokens.muted, display: "inline-flex", justifyContent: "center", minWidth: "1rem" },
  optionCopy: { gap: "0.12rem", display: "grid", minWidth: 0, },
  optionLabel: { overflow: "hidden", fontSize: tokens.fontControl, fontWeight: 400, textOverflow: "ellipsis", whiteSpace: "nowrap", },
  check: { color: tokens.accent, height: "0.9rem", width: "0.9rem" },
  status: { padding: tokens.space3, color: tokens.muted, fontSize: tokens.fontCaption, textAlign: "center" },
  create: { flexShrink: 0 },
  optionRow: { borderRadius: tokens.radiusSmall, gap: tokens.space1, alignItems: "center", backgroundColor: { default: "transparent", ":focus-within": `color-mix(in srgb, ${tokens.selection} 50%, ${tokens.panelRaised})`, ":hover": `color-mix(in srgb, ${tokens.selection} 50%, ${tokens.panelRaised})`, }, display: "flex", minWidth: 0, },
  optionCell: { flex: "1", minWidth: 0 },
  optionAction: { flexShrink: 0 },
});

function ChevronIcon() {
  return <svg {...stylex.attrs(styles.chevron)} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" /></svg>;
}

function CheckIcon() {
  return <svg {...stylex.attrs(styles.check)} viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3 3 7-7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" /></svg>;
}

function enabledOptions(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLButtonElement>('[data-select-option], [data-select-create]')]
    .filter((option) => !option.disabled && option.getAttribute("aria-disabled") !== "true");
}

function focusOption(root: HTMLElement, edge: "first" | "last" | "next" | "previous") {
  const options = enabledOptions(root);
  if (!options.length) return;
  const current = document.activeElement instanceof HTMLButtonElement
    ? options.indexOf(document.activeElement)
    : -1;
  const index = edge === "first"
    ? 0
    : edge === "last"
      ? options.length - 1
      : edge === "next"
        ? (current + 1 + options.length) % options.length
        : (current < 0 ? options.length : current) - 1;
  options[(index + options.length) % options.length]?.focus();
}

export function SelectControl<Value extends string = string>(props: SelectControlProps<Value>) {
  return <Show when={!props.hideWhenSingleOption || props.options.length > 1}><SelectControlContent {...props} /></Show>;
}

function SelectControlContent<Value extends string>(props: SelectControlProps<Value>) {
  const [query, setQuery] = createSignal("");
  const [activeTag, setActiveTag] = createSignal("all");
  const [pickerOpen, setPickerOpen] = createSignal(false);
  let popoverState: PopoverState | undefined;
  let triggerElement: HTMLButtonElement | undefined;
  const selected = createMemo(() => props.options.find((option) => option.value === props.value));
  const searchable = createMemo(() => props.searchable ?? props.options.length > (props.searchThreshold ?? 8));
  const hasTools = () => Boolean(props.optionAction) || searchable() || tags().length > 0 || Boolean(props.onCreate);
  const tags = createMemo<SelectTag[]>(() => {
    if (props.tags) return [...props.tags];
    const ids = new Set(props.options.flatMap((option) => option.tags ?? []));
    return [...ids].map((id) => ({ id, label: id }));
  });
  const visibleOptions = createMemo(() => {
    const normalizedQuery = query().trim().toLocaleLowerCase();
    const tag = activeTag();
    return props.options.filter((option) => {
      if (tag !== "all" && !option.tags?.includes(tag)) return false;
      if (!normalizedQuery) return true;
      return [option.label, option.description, ...(option.keywords ?? []), ...(option.tags ?? [])]
        .some((term) => term?.toLocaleLowerCase().includes(normalizedQuery));
    });
  });
  const optionsByValue = createMemo(() => new Map(props.options.map(option => [option.value, option] as const)));
  const preferredValue = createMemo(() => {
    const selectedOption = visibleOptions().find((option) => option.value === props.value && !option.disabled);
    return selectedOption?.value ?? visibleOptions().find((option) => !option.disabled)?.value;
  });
  const resetSearch = () => {
    if (query()) props.onSearch?.("");
    setQuery("");
    setActiveTag("all");
  };
  const choose = (option: SelectOption<Value>) => {
    if (props.disabled) return;
    if (!option.disabled && option.value !== props.value) {
      props.onChange(option.value);
      if (triggerElement) {
        triggerElement.dataset.selectValue = props.changeEventValue === "requested" ? option.value : props.value;
        try { triggerElement.dispatchEvent(new Event("change", { bubbles: true })); }
        finally { triggerElement.dataset.selectValue = props.value; }
      }
    }
    popoverState?.close({ restoreFocus: true });
    resetSearch();
  };
  const create = () => {
    if (props.disabled || !props.onCreate) return;
    const text = query().trim();
    popoverState?.close({ restoreFocus: true });
    resetSearch();
    props.onCreate(text);
  };
  const onContentKeyDown: JSX.EventHandler<HTMLDivElement, KeyboardEvent> = (event) => {
    if (props.optionAction && (event.key === "ArrowRight" || event.key === "ArrowLeft") && event.target instanceof Element) {
      const row = event.target.closest('[data-select-row]');
      const target = row?.querySelector<HTMLButtonElement>(event.key === "ArrowLeft" ? '[data-select-row-action] button' : '[data-select-option]');
      if (target && !target.disabled) { event.preventDefault(); target.focus(); return; }
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(event.currentTarget, "next");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(event.currentTarget, "previous");
    } else if (event.key === "Home" && event.target instanceof HTMLButtonElement) {
      event.preventDefault();
      focusOption(event.currentTarget, "first");
    } else if (event.key === "End" && event.target instanceof HTMLButtonElement) {
      event.preventDefault();
      focusOption(event.currentTarget, "last");
    }
  };

  const trigger = (state: PopoverState, toggle: () => void) => (
    <button
      ref={triggerElement}
      {...stylex.attrs(styles.trigger, sharedStyles.focusRing, (props.size ?? "sm") === "md" ? styles.triggerMedium : styles.triggerSmall)}
      {...props.dataAttributes}
      classList={{ [props.class ?? ""]: Boolean(props.class) }}
      type="button"
      aria-label={props.ariaLabel}
      aria-describedby={props.describedBy}
      aria-invalid={props.invalid || undefined}
      data-select-value={props.value}
      data-select-option-count={props.options.length}
      disabled={props.disabled || (props.options.length === 0 && !props.onCreate)}
      onClick={toggle}
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || state.open()) return;
        event.preventDefault();
        toggle();
      }}
    >
      <Show when={selected()?.icon ?? props.icon}>{(icon) => <span {...stylex.attrs(styles.triggerIcon)} aria-hidden="true">{icon()}</span>}</Show>
      <span {...stylex.attrs(styles.triggerLabel)} data-ui-select-value="">{selected()?.label ?? props.placeholder ?? props.value}</span>
      <ChevronIcon />
    </button>
  );

  const content = (
    <>
      <Show when={searchable()}>
        <input
          {...stylex.attrs(styles.search)}
          type="search"
          aria-label={`Search ${props.ariaLabel}`}
          placeholder={props.searchPlaceholder ?? "Search options"}
          value={query()}
          onInput={(event) => {
            const next = event.currentTarget.value;
            setQuery(next);
            props.onSearch?.(next);
          }}
        />
      </Show>
        <Show when={tags().length > 0}>
          <div {...stylex.attrs(styles.tags)} role="group" aria-label={`${props.ariaLabel} filters`}>
            <For each={[{ id: "all", label: "All" }, ...tags()]}>{(tag) => (
              <button
                {...stylex.attrs(styles.tag, activeTag() === tag.id ? styles.activeTag : undefined, sharedStyles.focusRing)}
                type="button"
                aria-pressed={activeTag() === tag.id}
                onClick={() => setActiveTag(tag.id)}
              >{tag.label}</button>
            )}</For>
          </div>
        </Show>
      <div
        {...stylex.attrs(styles.options)}
        role={props.optionAction ? "grid" : hasTools() ? "listbox" : undefined}
        aria-label={hasTools() ? props.ariaLabel : undefined}
        aria-busy={props.loading || undefined}
      >
        <For each={visibleOptions().map(option => option.value)}>{value => {
          const initial = optionsByValue().get(value);
          if (!initial) return null;
          const option = () => optionsByValue().get(value) ?? initial;
          const tooltipId = createUniqueId();
          const choice = <button
            {...stylex.attrs(styles.option, value === props.value ? styles.selectedOption : undefined, sharedStyles.focusRing)}
            type="button"
            role={props.optionAction ? undefined : "option"}
            aria-selected={props.optionAction ? undefined : value === props.value}
            disabled={props.disabled || option().disabled}
            data-select-option={value}
            aria-describedby={option().description ? tooltipId : undefined}
            tabIndex={value === preferredValue() ? 0 : -1}
            onClick={() => choose(option())}
            onPointerMove={(event) => {
              if (!option().disabled) event.currentTarget.focus({ preventScroll: true });
            }}
          >
            <span {...stylex.attrs(styles.optionIcon)} aria-hidden="true">{option().icon}</span>
            <span {...stylex.attrs(styles.optionCopy)}>
              <span {...stylex.attrs(styles.optionLabel)}>{option().label}</span>
            </span>
            <Show when={value === props.value}><CheckIcon /></Show>
          </button>;
          const describedChoice = <Tooltip id={tooltipId} content={option().description ?? option().label} disabled={!pickerOpen() || !option().description} class={stylex.attrs(styles.fill).class}>{choice}</Tooltip>;
          return <Show when={props.optionAction} fallback={describedChoice}>{action =>
            <div role="row" aria-selected={value === props.value} data-select-row={value} data-hf-reveal-group {...stylex.attrs(styles.optionRow, value === props.value && styles.selectedOption)}>
              <div role="gridcell" data-select-row-action {...stylex.attrs(styles.optionAction)}>{action()(option)}</div>
              <div role="gridcell" {...stylex.attrs(styles.optionCell)}>{describedChoice}</div>
            </div>
          }</Show>;
        }}</For>
        <Show when={props.loading}><div {...stylex.attrs(styles.status)} role="status">Loading options…</div></Show>
        <Show when={!props.loading && visibleOptions().length === 0}><div {...stylex.attrs(styles.status)} role="status">{props.emptyMessage ?? "No matching options"}</div></Show>
      </div>
      <Show when={props.onCreate}>
        <Button type="button" variant="secondary" class={stylex.attrs(styles.create).class} data-select-create="" disabled={props.disabled} justificationForNoTooltip="The creation action has a visible label" onClick={create}>{props.createLabel ?? "Add new…"}</Button>
      </Show>
    </>
  );

  const picker = () => (
    <Popover
      ariaLabel={hasTools() ? `${props.ariaLabel} options` : props.ariaLabel}
      autoFocus
      contentRole={hasTools() ? "dialog" : "listbox"}
      triggerHasPopup={hasTools() ? "dialog" : "listbox"}
      class={stylex.attrs(styles.fill).class}
      placement={props.placement}
      align={props.align ?? "start"}
      contentClass={`${stylex.attrs(styles.content).class} ${props.contentClass ?? ""}`.trim()}
      onContentKeyDown={onContentKeyDown}
      onOpenChange={(open) => {
        setPickerOpen(open);
        if (!open) resetSearch();
      }}
      trigger={(toggle, state) => {
        popoverState = state;
        return trigger(state, toggle);
      }}
    >{content}</Popover>
  );

  const tooltip = () => props.tooltip === false ? undefined : props.tooltip ?? selected()?.description;
  return (
    <span {...stylex.attrs(styles.root)} data-test-select-control="">
      <Tooltip class={stylex.attrs(styles.fill).class} content={tooltip() ?? props.ariaLabel} disabled={!tooltip() || pickerOpen() || props.invalid}>{picker()}</Tooltip>
    </span>
  );
}
