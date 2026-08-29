import * as stylex from "@stylexjs/stylex";
import { Show, createEffect, createRenderEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { tokens } from "../theme/tokens.stylex";
import { Button } from "./button";

export type CoachmarkStep = {
  id: string;
  title: string;
  description: string;
  target: string;
  requireTargetInteraction?: boolean;
  interactionHint?: string;
};

export type CoachmarkCloseReason = "complete" | "dismiss" | "skip";

export function canContinueCoachmark(step: CoachmarkStep | undefined, targetAvailable: boolean, interactionComplete: boolean) {
  return !step?.requireTargetInteraction || interactionComplete || !targetAvailable;
}

const styles = stylex.create({
  card: {
    padding: tokens.space4,
    borderColor: tokens.borderStrong,
    borderRadius: tokens.radiusLarge,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: tokens.overlay,
    boxShadow: tokens.shadow,
    color: tokens.foreground,
    fontFamily: tokens.fontUi,
    inlineSize: "min(360px, calc(100vw - 32px))",
    position: "fixed",
    zIndex: 10000,
  },
  header: { alignItems: "center", display: "flex", justifyContent: "space-between", marginBlockEnd: tokens.space2 },
  progress: { color: tokens.accent, fontFamily: tokens.fontMono, fontSize: "0.7rem", fontWeight: 750, letterSpacing: "0.07em", textTransform: "uppercase" },
  title: { margin: 0, fontSize: "1rem", lineHeight: 1.3, },
  description: { marginBlock: tokens.space2, color: tokens.muted, fontSize: "0.82rem", lineHeight: 1.55, },
  interaction: { padding: tokens.space2, borderRadius: tokens.radiusSmall, marginBlock: tokens.space3, backgroundColor: tokens.selection, color: tokens.foreground, fontSize: "0.75rem", },
  unavailable: { marginBlock: tokens.space3, color: tokens.warning, fontSize: "0.75rem", },
  footer: { gap: tokens.space2, display: "flex", justifyContent: "space-between", marginBlockStart: tokens.space4, },
});

export function CoachmarkTour(props: {
  open: boolean;
  steps: readonly CoachmarkStep[];
  initialStep?: number;
  label?: string;
  portal?: boolean;
  onStepChange?: (index: number, step: CoachmarkStep) => void;
  onClose: (reason: CoachmarkCloseReason) => void;
}) {
  const [stepIndex, setStepIndex] = createSignal(0);
  const [targetAvailable, setTargetAvailable] = createSignal(true);
  const [interactionComplete, setInteractionComplete] = createSignal(false);
  const [position, setPosition] = createSignal({ insetInlineStart: 16, insetBlockStart: 16 });
  let card!: HTMLElement;
  let wasOpen = false;

  const clampStep = (index: number) => Math.max(0, Math.min(Math.max(0, props.steps.length - 1), index));
  const step = () => props.steps[stepIndex()];
  const canContinue = () => canContinueCoachmark(step(), targetAvailable(), interactionComplete());

  createEffect(() => {
    if (props.open && !wasOpen) {
      const next = clampStep(props.initialStep ?? 0);
      setStepIndex(next);
      setInteractionComplete(false);
      if (props.steps[next]) props.onStepChange?.(next, props.steps[next]);
    }
    wasOpen = props.open;
  });

  createRenderEffect(() => {
    if (!props.open) return;
    const current = step();
    if (!current) return;
    const target = document.querySelector<HTMLElement>(current.target);
    setTargetAvailable(Boolean(target));
    setInteractionComplete(!current.requireTargetInteraction || !target);
    if (!target) {
      setPosition({ insetInlineStart: Math.max(16, (window.innerWidth - 360) / 2), insetBlockStart: 72 });
      return;
    }

    target.dataset.hfCoachmarkTarget = "true";
    const priorCurrent = target.getAttribute("aria-current");
    target.setAttribute("aria-current", "step");
    target.scrollIntoView?.({ block: "nearest", inline: "nearest" });

    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      const cardWidth = card?.offsetWidth || 360;
      const cardHeight = card?.offsetHeight || 230;
      const gap = 14;
      const inline = rect.right + gap + cardWidth <= window.innerWidth - 16
        ? rect.right + gap
        : rect.left - gap - cardWidth >= 16
          ? rect.left - gap - cardWidth
          : Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - cardWidth - 16));
      const block = rect.bottom + gap + cardHeight <= window.innerHeight - 16
        ? rect.bottom + gap
        : rect.top - gap - cardHeight >= 16
          ? rect.top - gap - cardHeight
          : Math.min(Math.max(16, rect.top), Math.max(16, window.innerHeight - cardHeight - 16));
      setPosition({ insetInlineStart: inline, insetBlockStart: block });
    };
    const onTargetInteraction = () => setInteractionComplete(true);
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updatePosition);
    const frame = requestAnimationFrame(updatePosition);
    target.addEventListener("click", onTargetInteraction);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    resizeObserver?.observe(target);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      target.removeEventListener("click", onTargetInteraction);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
      delete target.dataset.hfCoachmarkTarget;
      if (priorCurrent === null) target.removeAttribute("aria-current");
      else target.setAttribute("aria-current", priorCurrent);
    });
  });

  createEffect(() => {
    if (!props.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onClose("dismiss");
    };
    window.addEventListener("keydown", onKeyDown);
    queueMicrotask(() => card?.focus());
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  const moveTo = (index: number) => {
    const next = clampStep(index);
    setStepIndex(next);
    setInteractionComplete(false);
    const nextStep = props.steps[next];
    if (nextStep) props.onStepChange?.(next, nextStep);
  };
  const continueTour = () => {
    if (!canContinue()) return;
    if (stepIndex() >= props.steps.length - 1) props.onClose("complete");
    else moveTo(stepIndex() + 1);
  };

  const content = () => (
    <Show when={props.open && step()}>
      <aside
          {...stylex.attrs(styles.card)}
          style={{ "inset-inline-start": `${position().insetInlineStart}px`, "inset-block-start": `${position().insetBlockStart}px` }}
          role="dialog"
          aria-modal="false"
          aria-labelledby="hf-coachmark-title"
          aria-describedby="hf-coachmark-description"
          aria-label={props.label ?? "Guided tour"}
          tabIndex={-1}
          ref={card}
          data-hf-coachmark=""
        >
          <header {...stylex.attrs(styles.header)}>
            <span {...stylex.attrs(styles.progress)}>Step {stepIndex() + 1} of {props.steps.length}</span>
            <Button variant="ghost" size="small" tooltip="Skip guided tour" aria-label="Skip guided tour" onClick={() => props.onClose("skip")}>Skip</Button>
          </header>
          <h2 {...stylex.attrs(styles.title)} id="hf-coachmark-title">{step()?.title}</h2>
          <p {...stylex.attrs(styles.description)} id="hf-coachmark-description">{step()?.description}</p>
          <Show when={step()?.requireTargetInteraction && !interactionComplete() && targetAvailable()}>
            <p {...stylex.attrs(styles.interaction)} role="status">{step()?.interactionHint ?? "Use the highlighted control to continue."}</p>
          </Show>
          <Show when={!targetAvailable()}>
            <p {...stylex.attrs(styles.unavailable)} role="status">That control is not available in this view. You can continue safely.</p>
          </Show>
          <footer {...stylex.attrs(styles.footer)}>
            <Button variant="secondary" size="small" justificationForNoTooltip="Visible Back label" disabled={stepIndex() === 0} onClick={() => moveTo(stepIndex() - 1)}>Back</Button>
            <Button variant="primary" size="small" justificationForNoTooltip="Visible action label" disabled={!canContinue()} onClick={continueTour}>{stepIndex() === props.steps.length - 1 ? "Finish" : "Next"}</Button>
          </footer>
      </aside>
    </Show>
  );
  return props.portal === false ? content() : <Portal>{content()}</Portal>;
}
