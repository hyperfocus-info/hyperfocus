import { registerOverlay } from "../overlay-stack";

export type DomSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  keywords?: readonly string[];
  tags?: readonly string[];
};

export type DomSelectControl = {
  readonly element: HTMLButtonElement;
  readonly focused: boolean;
  value: string;
  disabled: boolean;
  setOptions: (options: readonly DomSelectOption[]) => void;
  close: () => void;
  dispose: () => void;
};

export type DomSelectControlOptions = {
  element: HTMLButtonElement;
  options?: readonly DomSelectOption[];
  value?: string;
  ariaLabel?: string;
  searchThreshold?: number;
  onSearch?: (query: string) => void;
};

type DomSelectClasses = Record<"trigger" | "triggerLabel" | "list" | "option" | "selected" | "copy" | "label" | "description" | "status" | "search" | "tags" | "tag" | "activeTag" | "popup", string>;
const gameClasses: DomSelectClasses = {
  trigger: 'hf-dom-select-trigger',
  triggerLabel: 'hf-dom-select-triggerLabel',
  list: 'hf-dom-select-list',
  option: 'hf-dom-select-option',
  selected: 'hf-dom-select-selected',
  copy: 'hf-dom-select-copy',
  label: 'hf-dom-select-label',
  description: 'hf-dom-select-description',
  status: 'hf-dom-select-status',
  search: 'hf-dom-select-search',
  tags: 'hf-dom-select-tags',
  tag: 'hf-dom-select-tag',
  activeTag: 'hf-dom-select-activeTag',
  popup: 'hf-dom-select-popup',
};

let domSelectSequence = 0;

function icon(path: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  shape.setAttribute("fill", "none");
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-linecap", "round");
  shape.setAttribute("stroke-linejoin", "round");
  shape.setAttribute("stroke-width", "1.7");
  svg.append(shape);
  return svg;
}

function optionButtons(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].filter((option) => !option.disabled);
}

export function createDomSelection(config: DomSelectControlOptions, classes: DomSelectClasses = gameClasses): DomSelectControl {
  const element = config.element;
  const overlayId = `hf-dom-select-${++domSelectSequence}`;
  let options = [...config.options ?? []];
  let value = config.value ?? options[0]?.value ?? "";
  let popup: HTMLDivElement | undefined;
  let modal: HTMLDialogElement | null = null;
  let query = "";
  let activeTag = "all";
  let unregisterOverlay: (() => void) | undefined;

  element.classList.add(...(classes.trigger).split(" ").filter(Boolean));
  element.type = "button";
  element.setAttribute("aria-haspopup", "listbox");
  element.setAttribute("aria-expanded", "false");
  if (config.ariaLabel) element.setAttribute("aria-label", config.ariaLabel);

  const selected = () => options.find((option) => option.value === value);
  const searchable = () => options.length > (config.searchThreshold ?? 8);
  const availableTags = () => [...new Set(options.flatMap((option) => option.tags ?? []))];
  const visibleOptions = () => {
    const normalized = query.trim().toLocaleLowerCase();
    return options.filter((option) => {
      if (activeTag !== "all" && !option.tags?.includes(activeTag)) return false;
      return !normalized || [option.label, option.description, ...(option.keywords ?? []), ...(option.tags ?? [])]
        .some((term) => term?.toLocaleLowerCase().includes(normalized));
    });
  };
  const syncTrigger = () => {
    const label = document.createElement("span");
    label.className = classes.triggerLabel;
    label.dataset.uiSelectValue = "";
    label.textContent = selected()?.label ?? (value || "Choose option");
    element.replaceChildren(label, icon("m4 6 4 4 4-4"));
    element.dataset.selectValue = value;
    element.dataset.selectOptionCount = String(options.length);
  };
  const position = () => {
    if (!popup) return;
    const gap = 6;
    const anchor = element.getBoundingClientRect();
    const rect = popup.getBoundingClientRect();
    const left = Math.max(gap, Math.min(window.innerWidth - rect.width - gap, anchor.left));
    const spaceBelow = window.innerHeight - anchor.bottom - gap;
    const preferredTop = rect.height <= spaceBelow || spaceBelow >= anchor.top - gap
      ? anchor.bottom + gap
      : Math.max(gap, anchor.top - rect.height - gap);
    const top = Math.max(gap, Math.min(window.innerHeight - rect.height - gap, preferredTop));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  };
  const close = (restoreFocus = false) => {
    modal?.removeEventListener('close', onModalClose);
    modal = null;
    popup?.remove();
    popup = undefined;
    unregisterOverlay?.();
    unregisterOverlay = undefined;
    element.setAttribute("aria-expanded", "false");
    if (query) config.onSearch?.("");
    query = "";
    activeTag = "all";
    if (restoreFocus) element.focus();
  };
  const onModalClose = () => close();
  const choose = (option: DomSelectOption) => {
    if (option.disabled) return;
    const changed = value !== option.value;
    value = option.value;
    syncTrigger();
    close(true);
    if (changed) element.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const renderList = () => {
    if (!popup) return;
    const existing = popup.querySelector('[data-dom-select-list]');
    existing?.remove();
    const list = document.createElement("div");
    list.className = classes.list;
    list.dataset.domSelectList = "";
    list.id = `${overlayId}-listbox`;
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", element.getAttribute("aria-label") ?? "Options");
    const visible = visibleOptions();
    const preferredValue = visible.find((option) => option.value === value && !option.disabled)?.value
      ?? visible.find((option) => !option.disabled)?.value;
    for (const option of visible) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${classes.option} ${option.value === value ? classes.selected : ""}`.trim();
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(option.value === value));
      button.dataset.selectOption = option.value;
      button.disabled = Boolean(option.disabled);
      button.tabIndex = option.value === preferredValue ? 0 : -1;
      const copy = document.createElement("span");
      copy.className = classes.copy;
      const label = document.createElement("strong");
      label.className = classes.label;
      label.textContent = option.label;
      copy.append(label);
      if (option.description) {
        const description = document.createElement("small");
        description.className = classes.description;
        description.textContent = option.description;
        copy.append(description);
      }
      button.append(copy, option.value === value ? icon("m3 8.5 3 3 7-7") : document.createElement("span"));
      button.addEventListener("pointermove", () => button.focus({ preventScroll: true }));
      button.addEventListener("click", () => choose(option));
      list.append(button);
    }
    if (!list.childElementCount) {
      const empty = document.createElement("div");
      empty.className = classes.status;
      empty.setAttribute("role", "status");
      empty.textContent = "No matching options";
      list.append(empty);
    }
    popup.append(list);
  };
  const renderPopup = () => {
    if (!popup) return;
    popup.replaceChildren();
    if (searchable()) {
      const search = document.createElement("input");
      search.className = classes.search;
      search.type = "search";
      search.setAttribute("aria-label", `Search ${element.getAttribute("aria-label") ?? "options"}`);
      search.placeholder = "Search options";
      search.value = query;
      search.addEventListener("input", () => {
        query = search.value;
        config.onSearch?.(query);
        renderList();
      });
      popup.append(search);
      const tags = availableTags();
      if (tags.length) {
        const tagList = document.createElement("div");
        tagList.className = classes.tags;
        tagList.setAttribute("role", "group");
        tagList.setAttribute("aria-label", `${element.getAttribute("aria-label") ?? "Option"} filters`);
        for (const tag of ["all", ...tags]) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `${classes.tag} ${activeTag === tag ? classes.activeTag : ""}`.trim();
          button.setAttribute("aria-pressed", String(activeTag === tag));
          button.textContent = tag === "all" ? "All" : tag;
          button.addEventListener("click", () => { activeTag = tag; renderPopup(); popup?.querySelector<HTMLInputElement>('input[type="search"]')?.focus(); });
          tagList.append(button);
        }
        popup.append(tagList);
      }
    }
    renderList();
  };
  const refreshPopup = () => {
    if (!popup) return;
    const active = document.activeElement;
    const focused = popup.contains(active);
    const optionValue = active instanceof HTMLElement ? active.dataset.selectOption : undefined;
    const search = active instanceof HTMLInputElement ? active : undefined;
    renderPopup();
    if (!focused) return;
    const options = [...popup.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const input = popup.querySelector<HTMLInputElement>('input[type="search"]');
    const target = (search ? input : options.find(option => option.dataset.selectOption === optionValue && !option.disabled))
      ?? options.find(option => option.tabIndex === 0) ?? input ?? element;
    target.focus({ preventScroll: true });
    if (search && target === input) input.setSelectionRange(search.selectionStart, search.selectionEnd);
  };
  const open = () => {
    if (popup || element.disabled || !options.length) return;
    popup = document.createElement("div");
    popup.className = classes.popup;
    popup.dataset.domSelectPopup = "";
    popup.addEventListener('keydown', onPopupKeyDown);
    popup.id = `${overlayId}-popup`;
    if (searchable()) {
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-label", `${element.getAttribute("aria-label") ?? "Select"} options`);
    }
    modal = element.closest<HTMLDialogElement>('dialog[open]');
    modal?.addEventListener('close', onModalClose);
    (modal ?? document.body).append(popup);
    renderPopup();
    element.setAttribute("aria-controls", `${overlayId}-listbox`);
    element.setAttribute("aria-expanded", "true");
    unregisterOverlay = registerOverlay({ id: overlayId, close: () => close(true), element: popup });
    position();
    queueMicrotask(() => (popup?.querySelector<HTMLInputElement>('input[type="search"]') ?? popup?.querySelector<HTMLButtonElement>('[role="option"][tabindex="0"]'))?.focus());
  };
  const onPointerDown = (event: PointerEvent) => {
    if (popup && event.target instanceof Node && !popup.contains(event.target) && !element.contains(event.target)) close();
  };
  const onFocusIn = (event: FocusEvent) => {
    if (popup && event.target instanceof Node && !popup.contains(event.target) && !element.contains(event.target)) close();
  };
  const onViewportChange = () => position();
  const onTriggerClick = () => popup ? close() : open();
  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (!popup && (event.key === "ArrowDown" || event.key === "ArrowUp")) { event.preventDefault();event.stopPropagation();open(); }
  };
  const onPopupKeyDown = (event: KeyboardEvent) => {
    if (!popup || !(event.target instanceof Node) || !popup.contains(event.target) || event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const buttons = optionButtons(popup);
    if (!buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = document.activeElement instanceof HTMLButtonElement ? buttons.indexOf(document.activeElement) : -1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? (current + 1 + buttons.length) % buttons.length : (current < 0 ? buttons.length - 1 : (current - 1 + buttons.length) % buttons.length);
    buttons[index]?.focus();
  };

  element.addEventListener("click", onTriggerClick);
  element.addEventListener("keydown", onTriggerKeyDown);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("focusin", onFocusIn, true);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  syncTrigger();

  return {
    element,
    close,
    get focused() { return element === document.activeElement || Boolean(popup?.contains(document.activeElement)); },
    get value() { return value; },
    set value(next) { if (value === next) return; value = next; syncTrigger(); refreshPopup(); },
    get disabled() { return element.disabled; },
    set disabled(next) { element.disabled = next; if (next) close(); },
    setOptions(next) {
      options = [...next];
      if (!options.some((option) => option.value === value)) value = options[0]?.value ?? "";
      syncTrigger();
      refreshPopup();
    },
    dispose() {
      close();
      element.removeEventListener("click", onTriggerClick);
      element.removeEventListener("keydown", onTriggerKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    },
  };
}
