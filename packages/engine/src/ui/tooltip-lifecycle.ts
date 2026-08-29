type TooltipTrigger = "hover" | "focus" | "manual";

export function createTooltipTimerController(options: {
  getHideDelayMs(): number;
  getShowDelayMs(): number;
  isDisabled(): boolean;
  onClose(): void;
  onOpen(): void;
}) {
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function clearOpen() {
    if (openTimer === undefined) return;
    clearTimeout(openTimer);
    openTimer = undefined;
  }
  function clearClose() {
    if (closeTimer === undefined) return;
    clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  function clear() {
    clearOpen();
    clearClose();
  }
  return {
    clear,
    clearClose,
    scheduleOpen() {
      if (options.isDisabled()) return;
      clearClose();
      clearOpen();
      const delay = options.getShowDelayMs();
      if (delay > 0) openTimer = setTimeout(options.onOpen, delay);
      else options.onOpen();
    },
    scheduleClose() {
      clearOpen();
      clearClose();
      const delay = options.getHideDelayMs();
      if (delay > 0) closeTimer = setTimeout(options.onClose, delay);
      else options.onClose();
    }
  };
}

export function createTooltipDescriptionController(tooltip: HTMLElement) {
  let describedTarget: HTMLElement | undefined;
  let previousDescribedBy: string | null = null;
  function remove() {
    if (!describedTarget) return;
    if (previousDescribedBy?.trim()) describedTarget.setAttribute("aria-describedby", previousDescribedBy);
    else describedTarget.removeAttribute("aria-describedby");
    describedTarget = undefined;
    previousDescribedBy = null;
  }
  return {
    apply(target: HTMLElement | undefined) {
      if (!target || describedTarget === target) return;
      remove();
      describedTarget = target;
      previousDescribedBy = target.getAttribute("aria-describedby");
      const ids = new Set((previousDescribedBy ?? "").split(/\s+/).filter(Boolean));
      ids.add(tooltip.id);
      target.setAttribute("aria-describedby", [...ids].join(" "));
    },
    isApplied() {
      return describedTarget !== undefined;
    },
    remove
  };
}

export function createTooltipPositionController(doc: Document, position: () => void) {
  let removers: (() => void)[] = [];
  return {
    bind() {
      if (removers.length > 0) return;
      const view = doc.defaultView;
      if (!view) return;
      view.addEventListener("resize", position);
      view.addEventListener("scroll", position, true);
      removers = [
        () => view.removeEventListener("resize", position),
        () => view.removeEventListener("scroll", position, true)
      ];
    },
    remove() {
      for (const remove of removers) remove();
      removers = [];
    }
  };
}

export function bindTooltipTarget(
  target: HTMLElement | undefined,
  triggers: ReadonlySet<TooltipTrigger>,
  scheduleOpen: () => void,
  scheduleClose: () => void
) {
  const removers: (() => void)[] = [];
  function listen(type: string, handler: () => void) {
    const listener = () => handler();
    target?.addEventListener(type, listener);
    removers.push(() => target?.removeEventListener(type, listener));
  }
  if (target && triggers.has("hover")) {
    listen("pointerenter", scheduleOpen);
    listen("pointerleave", scheduleClose);
  }
  if (target && triggers.has("focus")) {
    listen("focusin", scheduleOpen);
    listen("focusout", scheduleClose);
  }
  return () => {
    for (const remove of removers) remove();
  };
}
