import * as stylex from "@stylexjs/stylex";
import { createEffect, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "./button";

export function Dialog(props: { open: boolean; title: string; description?: string; onClose: () => void; children: JSX.Element; footer?: JSX.Element }) {
  let surface: HTMLElement | undefined;
  createEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
      if (event.key !== "Tab" || !surface) return;
      const focusable = [...surface.querySelectorAll<HTMLElement>('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    queueMicrotask(() => surface?.focus());
    onCleanup(() => { document.removeEventListener("keydown", keydown); previous?.focus(); });
  });
  return (
    <Show when={props.open}>
      <Portal>
        <div {...stylex.attrs(styles.backdrop)} onClick={props.onClose} data-test-dialog-backdrop="" />
        <div {...stylex.attrs(styles.positioner)}>
          <section
            ref={surface}
            tabindex="-1"
            role="dialog"
            aria-modal="true"
            aria-label={props.title}
            {...stylex.attrs(styles.surface)}
            onClick={(event) => event.stopPropagation()}
            data-test-dialog=""
          >
            <header {...stylex.attrs(styles.header)}>
              <div><h2 {...stylex.attrs(styles.title)}>{props.title}</h2><Show when={props.description}><p {...stylex.attrs(styles.description)}>{props.description}</p></Show></div>
              <Button variant="ghost" size="icon" tooltip="Close dialog" aria-label="Close dialog" onClick={props.onClose}>×</Button>
            </header>
            <div {...stylex.attrs(styles.body)} data-test-dialog-content="">{props.children}</div>
            <Show when={props.footer}><footer {...stylex.attrs(styles.footer)}>{props.footer}</footer></Show>
          </section>
        </div>
      </Portal>
    </Show>
  );
}

const styles = stylex.create({
  backdrop: { inset: 0, backdropFilter: "blur(3px)", backgroundColor: "rgb(0 0 0 / 58%)", position: "fixed", zIndex: 900, },
  positioner: { inset: 0, padding: "1rem", alignItems: "center", display: "flex", justifyContent: "center", pointerEvents: "none", position: "fixed", zIndex: 901, },
  surface: { padding: "1rem", borderColor: tokens.border, borderRadius: "14px", borderStyle: "solid", borderWidth: "1px", gap: "1rem", backgroundColor: tokens.panel, boxShadow: tokens.shadow, color: tokens.foreground, display: "flex", flexDirection: "column", pointerEvents: "auto", maxHeight: "90vh", maxWidth: "42rem", width: "100%", },
  header: { gap: "1rem", alignItems: "flex-start", display: "flex", justifyContent: "space-between", },
  title: { margin: 0, fontSize: "1.1rem", },
  description: { color: tokens.muted, fontSize: "0.78rem", lineHeight: 1.5, marginBlockEnd: 0, marginBlockStart: "0.25rem" },
  body: { gap: "0.8rem", overflow: "auto", display: "flex", flexDirection: "column", maxHeight: "80vh", },
  footer: { gap: "0.5rem", display: "flex", justifyContent: "flex-end", }
});

