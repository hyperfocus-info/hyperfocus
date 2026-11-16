import { registerOverlay } from "../overlay-stack";

const HOVER_BRIDGE_MS = 150;

/** A tooltip owns only its description token; caller updates remain authoritative. */
function describe(trigger: HTMLElement, id: string) {
  const ids = () => (trigger.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const sync = () => {
    const current = ids();
    if (!current.includes(id)) trigger.setAttribute("aria-describedby", [...current, id].join(" "));
  };
  sync();
  const observer = new MutationObserver(sync);
  observer.observe(trigger, { attributes: true, attributeFilter: ["aria-describedby"] });
  return () => {
    observer.disconnect();
    const remaining = ids().filter(token => token !== id).join(" ");
    if (remaining) trigger.setAttribute("aria-describedby", remaining);
    else trigger.removeAttribute("aria-describedby");
  };
}

/** Shared lifecycle for declarative controls and upgraded DOM titles. */
export function createTooltipInteraction(options: {
  id: string;
  enabled: () => boolean;
  delay?: () => number;
  content: () => HTMLElement | undefined;
  show: (trigger: HTMLElement) => void;
  hide: () => void;
}) {
  let trigger: HTMLElement | undefined;
  let focused = false;
  let hovered = false;
  let contentHovered = false;
  let open = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let removeDescription: (() => void) | undefined;
  let unregister: (() => void) | undefined;
  const dismiss = () => {
    clearTimeout(timer);
    clearTimeout(closeTimer);
    open = false;
    unregister?.();
    unregister = undefined;
    removeDescription?.();
    removeDescription = undefined;
    options.hide();
  };
  const select = (element: HTMLElement) => {
    if (trigger === element) return;
    dismiss();
    trigger = element;
    focused = false;
    hovered = false;
    contentHovered = false;
  };
  const reveal = () => {
    if (!trigger?.isConnected || !options.enabled() || (!focused && !hovered) || open) return;
    open = true;
    options.show(trigger);
    removeDescription = describe(trigger, options.id);
    unregister = registerOverlay({ id: options.id, close: dismiss, element: () => options.content() ?? trigger, focusOwner: false });
  };
  const requestOpen = (immediate: boolean) => {
    clearTimeout(closeTimer);
    clearTimeout(timer);
    if (immediate || (options.delay?.() ?? 350) === 0) reveal();
    else timer = setTimeout(reveal, options.delay?.() ?? 350);
  };
  const requestClose = (bridge: boolean) => {
    if (focused || hovered || contentHovered) return;
    clearTimeout(timer);
    clearTimeout(closeTimer);
    if (bridge && open) closeTimer = setTimeout(dismiss, HOVER_BRIDGE_MS);
    else dismiss();
  };
  return {
    dismiss,
    dispose: dismiss,
    pointerEnter(element: HTMLElement) { select(element); hovered = true; requestOpen(false); },
    pointerLeave() { hovered = false; requestClose(true); },
    focusIn(element: HTMLElement) { select(element); focused = true; requestOpen(true); },
    focusOut() { focused = false; requestClose(false); },
    contentEnter() { contentHovered = true; clearTimeout(closeTimer); },
    contentLeave() { contentHovered = false; requestClose(true); },
  };
}
