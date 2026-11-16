import { createTooltipInteraction } from "./tooltip/interaction";

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
    font: "var(--hf-font-caption, 0.75rem)/1.4 var(--hf-font-ui, system-ui, sans-serif)",
    maxWidth: "min(18rem, calc(100vw - 16px))",
    boxSizing: "border-box",
    padding: "0.4rem 0.55rem",
    pointerEvents: "auto",
    position: "fixed",
    zIndex: "1200",
  });
  document.body.append(tooltip);
  let active: HTMLElement | undefined;

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
  const interaction = createTooltipInteraction({
    id, enabled: () => true, content: () => tooltip,
    show: (element) => {
      active = element;
      const layer = element.closest('dialog[open]') ?? document.body;
      if (tooltip.parentElement !== layer) layer.append(tooltip);
      tooltip.textContent = element.dataset.hfTooltip ?? "";
      tooltip.hidden = false;
      position();
    },
    hide: () => { active = undefined; tooltip.hidden = true; },
  });
  const findTrigger = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-hf-tooltip]") : undefined;
  const onPointerOver: EventListener = (event) => {
    if (!(event instanceof PointerEvent)) return;
    const trigger = findTrigger(event.target);
    if (trigger && !trigger.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) interaction.pointerEnter(trigger);
  };
  const onPointerOut: EventListener = (event) => {
    const trigger = findTrigger(event.target);
    if (event instanceof PointerEvent && trigger && !trigger.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) interaction.pointerLeave();
  };
  const onFocusIn: EventListener = (event) => {
    if (!(event instanceof FocusEvent)) return;
    const trigger = findTrigger(event.target);
    if (trigger) interaction.focusIn(trigger);
  };
  const onFocusOut: EventListener = (event) => {
    if (event instanceof FocusEvent && active && !active.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) interaction.focusOut();
  };
  const onClick: EventListener = event => { if (findTrigger(event.target)) interaction.dismiss(); };
  const onViewportChange = () => position();
  const observer = new MutationObserver((records) => {
    if (active && !active.isConnected) interaction.dismiss();
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
  root.addEventListener("click", onClick);
  tooltip.addEventListener("pointerenter", interaction.contentEnter);
  tooltip.addEventListener("pointerleave", interaction.contentLeave);
  window.addEventListener("resize", onViewportChange);
  window.addEventListener("scroll", onViewportChange, true);
  observer.observe(root, { attributes: true, attributeFilter: ["title"], childList: true, subtree: true });

  return () => {
    interaction.dispose();
    observer.disconnect();
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    root.removeEventListener("click", onClick);
    tooltip.removeEventListener("pointerenter", interaction.contentEnter);
    tooltip.removeEventListener("pointerleave", interaction.contentLeave);
    window.removeEventListener("resize", onViewportChange);
    window.removeEventListener("scroll", onViewportChange, true);
    tooltip.remove();
  };
}
