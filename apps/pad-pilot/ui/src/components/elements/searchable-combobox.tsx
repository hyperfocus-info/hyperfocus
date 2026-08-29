import { For, Show, createEffect, createMemo, createSignal, createUniqueId, onCleanup, splitProps, type JSX } from "solid-js";
import { FloatingLayer } from "./floating-layer";
import { joinElementClasses as joinClasses } from "./element-helpers";
import { filterSearchableComboboxItems, resolveSearchableComboboxItemId } from "./searchable-combobox-utils";
import { Tooltip } from "./tooltip";
import styles from "./searchable-combobox.module.css";

/**
 * Shared item shape for searchable combobox options.
 */
export type SearchableComboboxItem = {
  id: string;
  label: string;
  description?: string;
  favorite?: boolean;
  /** Additional non-rendered terms used for search matching. */
  keywords?: readonly string[];
  kind?: string;
};

export type SearchableComboboxClassNames = {
  empty?: string;
  field?: string;
  input?: string;
  item?: string;
  itemMeta?: string;
  itemText?: string;
  list?: string;
  root?: string;
  searchIcon?: string;
  toggle?: string;
};

/**
 * Props for SearchableCombobox.
 */
export type SearchableComboboxProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  /** Optional slot-level classes for locally scoped styling. */
  classNames?: SearchableComboboxClassNames;
  /** Disables text input, option selection, and popover open. */
  disabled?: boolean;
  /** Available selectable items. */
  items: SearchableComboboxItem[];
  /** Marks the current query as invalid. */
  invalid?: boolean;
  /** Current input query. */
  query: string;
  /** Whether the options popover is open. */
  open: boolean;
  /** Placeholder text for the search input. */
  placeholder: string;
  /** Empty state text when no items match. */
  emptyText: string;
  /** Currently selected item id. */
  selectedId?: string;
  /** Called when the query text changes. */
  onQueryChange: (value: string) => void;
  /** Called when the popover open state changes. */
  onOpenChange: (open: boolean) => void;
  /** Called when an item is selected. */
  onSelect: (id: string) => void;
  /** Accessible label for the search input. */
  searchLabel?: string;
  /** Accessible label for the toggle button. */
  toggleLabel?: string;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M10.5 10.5L13.5 13.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 6.5L8 10L12 6.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 1.8L9.9 5.7L14.2 6.3L11.1 9.3L11.8 13.6L8 11.6L4.2 13.6L4.9 9.3L1.8 6.3L6.1 5.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path d="M3.5 8.3L6.5 11.3L12.5 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export { filterSearchableComboboxItems, resolveSearchableComboboxItemId };

function eventHandler(handler: unknown, event: Event) {
  if (typeof handler === "function") {
    (handler as (value: Event) => void)(event);
  }
}

/** SearchableCombobox renders a controlled searchable listbox with PadPilot styling and sorting rules. */
export function SearchableCombobox(props: SearchableComboboxProps) {
  const [local, others] = splitProps(props, [
    "class",
    "classNames",
    "disabled",
    "emptyText",
    "invalid",
    "items",
    "onOpenChange",
    "onQueryChange",
    "onSelect",
    "open",
    "placeholder",
    "query",
    "searchLabel",
    "selectedId",
    "toggleLabel",
  ]);
  const filtered = createMemo(() => filterSearchableComboboxItems(local.items, local.query));
  let rootRef: HTMLDivElement | undefined;
  let listRef: HTMLDivElement | undefined;
  const listId = createUniqueId();
  const [activeId, setActiveId] = createSignal<string>();
  const itemRefs = new Map<string, HTMLButtonElement>();
  const optionId = (id: string) => `${listId}-${id}`;
  const selectActive = (id: string | undefined) => {
    const item = filtered().find((candidate) => candidate.id === id);
    if (!item) {
      return;
    }
    local.onSelect(item.id);
    local.onQueryChange(item.label);
    local.onOpenChange(false);
  };
  const selectableItems = () => filterSearchableComboboxItems(local.items, local.open ? local.query : "");
  const selectedIndex = (items: SearchableComboboxItem[]) => {
    const selectedById = local.selectedId
      ? items.findIndex((item) => item.id === local.selectedId)
      : -1;
    if (selectedById >= 0) {
      return selectedById;
    }
    return items.findIndex((item) => item.label === local.query);
  };
  const selectWheelOption = (direction: number) => {
    const items = selectableItems();
    if (items.length === 0) {
      return;
    }
    const currentIndex = selectedIndex(items);
    const fallbackIndex = direction > 0 ? -1 : items.length;
    const nextIndex = Math.min(items.length - 1, Math.max(0, (currentIndex >= 0 ? currentIndex : fallbackIndex) + direction));
    const item = items[nextIndex];
    if (!item) {
      return;
    }
    setActiveId(item.id);
    local.onSelect(item.id);
    local.onQueryChange(item.label);
    queueMicrotask(() => itemRefs.get(item.id)?.scrollIntoView({ block: "nearest" }));
  };

  createEffect(() => {
    if (local.disabled && local.open) {
      local.onOpenChange(false);
      return;
    }

    if (!local.open || local.disabled) {
      return;
    }

    let active = true;
    queueMicrotask(() => {
      if (!active || !local.open || local.disabled) {
        return;
      }
      if (listRef) {
        listRef.scrollTop = 0;
      }

      const nextActive = local.selectedId && filtered().some((item) => item.id === local.selectedId)
        ? local.selectedId
        : filtered()[0]?.id;
      setActiveId(nextActive);
      if (nextActive) {
        itemRefs.get(nextActive)?.scrollIntoView({ block: "nearest" });
      }
    });
    onCleanup(() => {
      active = false;
    });
  });

  createEffect(() => {
    if (!local.open || local.disabled || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        local.onOpenChange(false);
        return;
      }

      if (rootRef?.contains(target) || listRef?.contains(target)) {
        return;
      }

      local.onOpenChange(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      local.onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  return (
    <div
      {...others}
      ref={rootRef}
      class={joinClasses(styles.root, local.class, local.classNames?.root)}
      aria-disabled={local.disabled ? "true" : undefined}
      onWheel={(event) => {
        eventHandler(others.onWheel, event);
        if (local.disabled || event.defaultPrevented) {
          return;
        }
        event.preventDefault();
        selectWheelOption(event.deltaY > 0 ? 1 : -1);
      }}
    >
      <div class={joinClasses(styles.field, local.classNames?.field)}>
        <span class={joinClasses(styles["search-icon"], local.classNames?.searchIcon)} aria-hidden="true">
          <SearchIcon />
        </span>
        <input
          class={joinClasses(styles.input, local.classNames?.input)}
          role="combobox"
          aria-label={local.searchLabel ?? "Search options"}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeId() ? optionId(activeId()!) : undefined}
          aria-expanded={local.open && !local.disabled}
          aria-invalid={local.invalid ? "true" : undefined}
          disabled={local.disabled}
          placeholder={local.placeholder}
          value={local.query}
          onFocus={() => {
            if (!local.disabled) local.onOpenChange(true);
          }}
          onInput={(event) => {
            if (local.disabled) return;
            local.onQueryChange(event.currentTarget.value);
            local.onOpenChange(true);
            queueMicrotask(() => setActiveId(filtered()[0]?.id));
          }}
          onKeyDown={(event) => {
            if (local.disabled) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!local.open) {
                local.onOpenChange(true);
              }
              const items = filtered();
              if (items.length === 0) {
                return;
              }
              const currentIndex = items.findIndex((item) => item.id === activeId());
              const nextIndex = currentIndex < 0
                ? event.key === "ArrowDown" ? 0 : items.length - 1
                : event.key === "ArrowDown"
                  ? Math.min(items.length - 1, currentIndex + 1)
                  : Math.max(0, currentIndex - 1);
              setActiveId(items[nextIndex]?.id);
              queueMicrotask(() => itemRefs.get(items[nextIndex]?.id ?? "")?.scrollIntoView({ block: "nearest" }));
            } else if (event.key === "Enter") {
              event.preventDefault();
              selectActive(activeId() ?? filtered()[0]?.id);
            } else if (event.key === "Escape" && local.open) {
              event.preventDefault();
              local.onOpenChange(false);
            }
          }}
        />
        <Tooltip content={local.toggleLabel ?? "Browse options"}>
          <button
            type="button"
            aria-expanded={local.open}
            class={joinClasses(styles.toggle, local.classNames?.toggle)}
            disabled={local.disabled}
            onClick={() => {
              if (!local.disabled) local.onOpenChange(!local.open);
            }}
          >
            <span class={styles["screen-reader-only"]}>{local.toggleLabel ?? "Browse options"}</span>
            <ChevronIcon />
          </button>
        </Tooltip>
      </div>
      <FloatingLayer anchorRef={() => rootRef} class={joinClasses(styles.list, local.classNames?.list)} id={listId} matchWidth open={local.open && !local.disabled} placement="bottom" role="listbox">
        <div ref={listRef}>
          <Show when={filtered().length > 0} fallback={<div class={joinClasses(styles.empty, local.classNames?.empty)}>{local.emptyText}</div>}>
            <For each={filtered()}>
              {(item) => (
                <button
                  ref={(element) => itemRefs.set(item.id, element)}
                  type="button"
                  class={joinClasses(styles.item, local.classNames?.item)}
                  classList={{ [styles["is-active"]]: local.selectedId === item.id || activeId() === item.id }}
                  disabled={local.disabled}
                  id={optionId(item.id)}
                  role="option"
                  aria-selected={local.selectedId === item.id}
                  onPointerEnter={() => setActiveId(item.id)}
                  onClick={() => {
                    local.onSelect(item.id);
                    local.onQueryChange(item.label);
                    local.onOpenChange(false);
                  }}
                >
                  <div class={joinClasses(styles["item-text"], local.classNames?.itemText)}>
                    <strong>{item.label}</strong>
                    <Show when={item.description}>
                      <small>{item.description}</small>
                    </Show>
                  </div>
                  <div class={joinClasses(styles["item-meta"], local.classNames?.itemMeta)}>
                    <Show when={item.favorite}>
                      <StarIcon />
                    </Show>
                    <Show when={local.selectedId === item.id}>
                      <CheckIcon />
                    </Show>
                  </div>
                </button>
              )}
            </For>
          </Show>
        </div>
      </FloatingLayer>
    </div>
  );
}
