import { registerOverlay as registerSharedOverlay, isTopOverlay } from '@hyperfocus/ui/primitives';
export { isTopOverlay };
const registrations = new Set<() => void>();
const focusReturnStack: Array<{ id: string; element: HTMLElement | null }> = [];

/** Keep Harness focus restoration while sharing Escape order with shared menus and dialogs. */
export function registerOverlay(id: string, options: Pick<Parameters<typeof registerSharedOverlay>[0], 'element' | 'restoreFocus'> & { onEscape?: () => void } = {}) {
  const unregister = registerSharedOverlay({ id, close: () => options.onEscape?.(), element: options.element, restoreFocus: options.restoreFocus });
  const dispose = () => { unregister(); registrations.delete(dispose); };
  registrations.add(dispose);
  return dispose;
}

export function registerFocusReturn(id: string, element: HTMLElement | null) {
  focusReturnStack.push({ id, element });
  return () => {
    const index = findLastFocusReturnIndex(id);
    if (index >= 0) {
      focusReturnStack.splice(index, 1);
    }
  };
}

export function restoreOverlayFocus(id: string) {
  const index = findLastFocusReturnIndex(id);
  const entry = index >= 0 ? focusReturnStack.splice(index, 1)[0] : undefined;
  entry?.element?.focus?.();
}

function findLastFocusReturnIndex(id: string) {
  for (let index = focusReturnStack.length - 1; index >= 0; index -= 1) {
    if (focusReturnStack[index]?.id === id) {
      return index;
    }
  }
  return -1;
}

export function trapFocusInOverlay(event: KeyboardEvent, root: HTMLElement | undefined) {
  if (event.key !== "Tab" || !root) {
    return;
  }
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(
    [
      "a[href]",
      "button:not([disabled])",
      "textarea:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",")
  )].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

export function clearOverlayStackForTests() {
  for (const unregister of registrations) unregister();
  focusReturnStack.length = 0;
}
