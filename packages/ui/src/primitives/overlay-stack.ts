export type OverlayEntry = {
  id: string;
  /** Native dialogs synchronize after an accepted cancel/close; veto with a cancel listener. */
  close: () => void;
  /** Supply the surface for native-dialog arbitration and safe focus restoration. */
  element?: HTMLElement | (() => HTMLElement | undefined);
  restoreFocus?: HTMLElement | null;
  /** False for descriptive overlays that dismiss on Escape but never own keyboard focus. */
  focusOwner?: boolean;
  target?: Window;
};

const registries = new WeakMap<Window, ReturnType<typeof createRegistry>>();
const surface = (entry: OverlayEntry) => typeof entry.element === "function" ? entry.element() : entry.element;

function createRegistry(target: Window) {
  const stack: (OverlayEntry & { detach: () => void })[] = [];
  const pending = new Map<KeyboardEvent, (typeof stack)[number]>();
  const release = () => {
    if (stack.length || pending.size) return;
    target.removeEventListener("keydown", capture, true);
    target.removeEventListener("keydown", onKeyDown);
  };
  const capture = (event: KeyboardEvent) => {
    const entry = stack.at(-1);
    if (event.key !== "Escape" || !entry) return;
    pending.set(event, entry);
    // A child can stop propagation or dispose the last overlay. Retain this
    // event's guard through dispatch, then release both the snapshot and listener.
    target.setTimeout(() => { pending.delete(event); release(); }, 0);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const entry = pending.get(event);
    if (!entry) return;
    pending.delete(event);
    release();
    // Run after native target and delegated control handlers, never in capture.
    // Later window handlers must not dismiss a newly exposed underlying layer.
    event.stopImmediatePropagation();
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.repeat || stack.at(-1) !== entry) { event.preventDefault(); return; }
    // An unregistered native modal is in the browser's top layer above DOM drawers.
    const active = target.document.activeElement;
    const native = active?.closest("dialog[open]");
    const element = surface(entry);
    if (native && !native.contains(element ?? null)) return;
    // Preserve the browser's cancellable cancel event. Custom popups inside a
    // native modal still prevent the key's default so only the popup dismisses.
    if (element?.tagName === "DIALOG") return;
    event.preventDefault();
    entry.close();
  };
  return { stack, capture, onKeyDown, release, ownsEscape: (event: KeyboardEvent) => pending.has(event) };
}

/** Register for the open lifetime only. Cleanup is idempotent and never removes a replacement. */
export function registerOverlay(entry: OverlayEntry) {
  const target = entry.target ?? surface(entry)?.ownerDocument.defaultView ?? (typeof window === "undefined" ? undefined : window);
  if (!target) return () => {};
  let registry = registries.get(target);
  if (!registry) { registry = createRegistry(target); registries.set(target, registry); }
  const { stack, capture, onKeyDown, release } = registry;
  const existing = stack.findIndex(candidate => candidate.id === entry.id);
  if (existing >= 0) { stack[existing].detach(); stack.splice(existing, 1); }
  const registered = { ...entry, detach: () => {} };
  stack.push(registered);
  target.addEventListener("keydown", capture, true);
  target.addEventListener("keydown", onKeyDown);
  const element = surface(entry);
  let nativeCancellation: Event | undefined;
  const cancel = (event: Event) => {
    // Observers registered before OR after us can veto native cancellation.
    if (stack.at(-1) !== registered) event.preventDefault();
    nativeCancellation = event;
  };
  // Native close events are queued; an old close must not unregister a reopened dialog.
  const nativeClose = () => {
    if (element?.hasAttribute("open")) return;
    const requested = nativeCancellation && !nativeCancellation.defaultPrevented;
    nativeCancellation = undefined;
    unregister();
    // The native default has now closed the dialog. Synchronize the host only
    // after every cancel observer had its chance to prevent that default.
    if (requested) entry.close();
  };
  registered.detach = () => {
    element?.removeEventListener("cancel", cancel);
    element?.removeEventListener("close", nativeClose, true);
  };
  const unregister = () => {
    registered.detach();
    const index = stack.indexOf(registered);
    if (index < 0) return;
    const wasTop = index === stack.length - 1;
    stack.splice(index, 1);
    release();
    const active = target.document.activeElement;
    const previous = entry.restoreFocus;
    if (wasTop && previous?.isConnected && !previous.closest('[hidden], [inert]') &&
      (!active || active === target.document.body || !active.isConnected || surface(entry)?.contains(active))) {
      previous.focus({ preventScroll: true });
    }
  };
  if (element?.tagName === "DIALOG") {
    element.addEventListener("cancel", cancel);
    element.addEventListener("close", nativeClose, true);
  }
  return unregister;
}

export function isTopOverlay(id: string, target: Window | undefined = typeof window === "undefined" ? undefined : window) {
  return target ? registries.get(target)?.stack.at(-1)?.id === id : false;
}

export function isTopFocusOverlay(id: string, target: Window | undefined = typeof window === "undefined" ? undefined : window) {
  const stack = target ? registries.get(target)?.stack : undefined;
  for (let index = (stack?.length ?? 0) - 1; index >= 0; index--) {
    const entry = stack![index]!;
    if (entry.focusOwner !== false) return entry.id === id;
  }
  return false;
}

/** Delegated hosts defer Escape until the overlay present at dispatch has handled it. */
export function overlayOwnsEscape(event: KeyboardEvent, target: Window | undefined = typeof window === "undefined" ? undefined : window) {
 return target ? registries.get(target)?.ownsEscape(event) ?? false : false;
}
