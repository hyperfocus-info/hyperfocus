let domTooltipSequence = 0;

/**
 * Upgrades legacy or framework-neutral DOM `title` attributes into the shared
 * tooltip behavior. New declarative UI should use `Tooltip`/`Button` directly.
 */
export function installDomTooltips(root: ParentNode = document) {
  const id = `hf-dom-tooltip-${++domTooltipSequence}`;
  const tooltip = document.createElement("div");
  tooltip.id = id;
  tooltip.role = "tooltip";
  tooltip.dataset.hfDomTooltip = "";
  tooltip.hidden = true;
  Object.assign(tooltip.style, {
    background: "var(--hf-color-overlay, #09151a)",
    border: "1px solid var(--hf-color-border, #263840)",
    borderRadius: "var(--hf-radius-sm, 6px)",
    boxShadow: "var(--hf-shadow-lg, 0 18px 54px rgb(0 0 0 / 35%))",
    color: "var(--hf-color-text, #e9f5f4)",
    font: "0.72rem/1.4 var(--hf-font-ui, system-ui, sans-serif)",
    maxWidth: "18rem",
    padding: "0.4rem 0.55rem",
    pointerEvents: "none",
    position: "fixed",
    zIndex: "1200",
  });
  document.body.append(tooltip);
  let active: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const upgrade = (scope: ParentNode) => {
    const candidates = [scope instanceof HTMLElement ? scope : undefined, ...scope.querySelectorAll<HTMLElement>("[title]")].filter((candidate): candidate is HTMLElement => Boolean(candidate));
    for (const element of candidates) {
      const content = element.getAttribute("title");
      if (!content) continue;
      element.dataset.hfTooltip = content;
      element.removeAttribute("title");
      if (!element.getAttribute("aria-label") && !element.textContent?.trim()) element.setAttribute("aria-label", content);
    }
  };
  const position = () => {
    if (!active) return;
    const rect = active.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(gap, Math.min(window.innerWidth - tooltipRect.width - gap, rect.left + rect.width / 2 - tooltipRect.width / 2));
    const below = rect.bottom + gap;
    const top = below + tooltipRect.height <= window.innerHeight - gap ? below : Math.max(gap, rect.top - tooltipRect.height - gap);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const show = (element: HTMLElement, immediate: boolean) => {
    clearTimeout(timer);
    active = element;
    const reveal = () => {
      if (!active?.dataset.hfTooltip) return;
      tooltip.textContent = active.dataset.hfTooltip;
      tooltip.hidden = false;
      active.setAttribute("aria-describedby", id);
      position();
    };
    if (immediate) reveal(); else timer = setTimeout(reveal, 350);
  };
  const hide = () => {
    clearTimeout(timer);
    active?.removeAttribute("aria-describedby");
    active = undefined;
    tooltip.hidden = true;
  };
  const findTrigger = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-hf-tooltip]") : undefined;
  const onPointerOver: EventListener = (event) => {
    if (!(event instanceof PointerEvent)) return;
    const trigger = findTrigger(event.target);
    if (trigger) show(trigger, false);
  };
  const onPointerOut: EventListener = (event) => {
    if (event instanceof PointerEvent && active && !active.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) hide();
  };
  const onFocusIn: EventListener = (event) => {
    if (!(event instanceof FocusEvent)) return;
    const trigger = findTrigger(event.target);
    if (trigger) show(trigger, true);
  };
  const onFocusOut: EventListener = (event) => {
    if (event instanceof FocusEvent && active && !active.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) hide();
  };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
  const onViewportChange = () => position();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLElement) upgrade(record.target);
      for (const node of record.addedNodes) if (node instanceof HTMLElement) upgrade(node);
    }
  });

  upgrade(root);
  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  observer.observe(root, { attributes: true, attributeFilter: ["title"], childList: true, subtree: true });

  return () => {
    clearTimeout(timer);
    observer.disconnect();
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
    tooltip.remove();
  };
}
