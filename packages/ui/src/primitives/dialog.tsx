import * as stylex from "@stylexjs/stylex";
import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "./button";
import { isTopFocusOverlay, isTopOverlay, registerOverlay } from "./overlay-stack";

let dialogSequence = 0;

function hiddenByDisclosure(element: HTMLElement) {
  // Chromium can report visible styles and rectangles for closed details content.
  // Only its first summary remains in the native tab order.
  for (let details = element.parentElement?.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) {
    const summary = [...details.children].find(child => child.tagName === "SUMMARY");
    if (!summary?.contains(element)) return true;
  }
  return false;
}

const styles = stylex.create({
  commandPosition: { alignItems: 'flex-start', paddingTop: 'min(18dvh, 8rem)' },
  commandSurface: { padding: 0, gap: 0, overflow: 'hidden', position: 'relative', maxWidth: '36rem', },
  commandHeader: { position: 'absolute', zIndex: 1, right: '0.4rem', top: '0.4rem', },
  commandTitle: { overflow: 'hidden', clipPath: 'inset(50%)', position: 'absolute', whiteSpace: 'nowrap', height: 1, width: 1, },
  commandBody: { overflow: 'hidden', maxHeight: 'min(68dvh, 32rem)' },
  backdrop: { inset: 0, backdropFilter: "blur(3px)", backgroundColor: tokens.scrim, position: "fixed", zIndex: 900, },
  positioner: { inset: 0, padding: { default: tokens.space4, "@media (max-width: 30rem)": tokens.space2 }, alignItems: "center", boxSizing: "border-box", display: "flex", justifyContent: "center", pointerEvents: "none", position: "fixed", zIndex: 901, },
  surface: { padding: { default: tokens.space4, "@media (max-width: 30rem)": tokens.space2 }, borderColor: tokens.border, borderRadius: tokens.radius, borderStyle: "solid", borderWidth: "1px", gap: tokens.space4, backgroundColor: tokens.panel, boxShadow: tokens.shadow, boxSizing: "border-box", color: tokens.foreground, display: "flex", flexDirection: "column", pointerEvents: "auto", maxHeight: "min(90dvh, calc(100dvh - 2rem))", maxWidth: "42rem", minWidth: 0, width: "100%", },
  header: { gap: tokens.space3, alignItems: "flex-start", display: "flex", flexShrink: 0, justifyContent: "space-between", minWidth: 0, },
  title: { margin: 0, fontSize: tokens.fontSection, overflowWrap: "anywhere", minWidth: 0, },
  description: { margin: 0, color: tokens.muted, fontSize: tokens.fontBody, lineHeight: 1.5, },
  body: { gap: tokens.space3, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, },
  footer: { gap: tokens.space2, display: "flex", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end", }
});

export function Dialog(props: { open: boolean; title: string; description?: string; onClose: () => void; children: JSX.Element; footer?: JSX.Element; presentation?: 'command' }) {
  const id = `hf-dialog-${++dialogSequence}`;
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  let surface: HTMLElement | undefined;
  createEffect(() => {
    if (!props.open) return;
    let active = true;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const unregister = registerOverlay({ id, close: () => props.onClose(), element: () => surface, restoreFocus: previous });
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !surface || !isTopFocusOverlay(id)) return;
      const focusable = [...surface.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], summary, [tabindex]')]
        .filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest('[hidden], [inert], [aria-hidden="true"]') && !hiddenByDisclosure(element) && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
      if (focusable.length === 0) { event.preventDefault(); surface.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusable.some((element) => element === document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    queueMicrotask(() => { if (active && props.open && isTopOverlay(id)) surface?.focus(); });
    onCleanup(() => { active = false; unregister(); document.removeEventListener("keydown", keydown); });
  });
  return (
    <Show when={props.open}>
      <Portal>
        <div {...stylex.attrs(styles.backdrop)} onClick={() => { if (isTopOverlay(id)) props.onClose(); }} data-test-dialog-backdrop="" />
        <div {...stylex.attrs(styles.positioner, props.presentation === 'command' && styles.commandPosition)}>
          <section
            ref={surface}
            tabindex="-1"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={props.description ? descriptionId : undefined}
            {...stylex.attrs(styles.surface, props.presentation === 'command' && styles.commandSurface)}
            onClick={(event) => event.stopPropagation()}
            data-test-dialog=""
          >
            <header {...stylex.attrs(styles.header, props.presentation === 'command' && styles.commandHeader)}>
              <h2 id={titleId} {...stylex.attrs(styles.title, props.presentation === 'command' && styles.commandTitle)}>{props.title}</h2>
              <Button variant="ghost" size="icon" tooltip="Close dialog" aria-label="Close dialog" onClick={props.onClose}>×</Button>
            </header>
            <div {...stylex.attrs(styles.body, props.presentation === 'command' && styles.commandBody)} data-test-dialog-content="" data-ui-dialog-body=""><Show when={props.description}><p id={descriptionId} {...stylex.attrs(styles.description)}>{props.description}</p></Show>{props.children}</div>
            <Show when={props.footer}><footer {...stylex.attrs(styles.footer)}>{props.footer}</footer></Show>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
