import { createContext, createEffect, createMemo, createSignal, onCleanup, onMount, Show, untrack, useContext, type Accessor } from "solid-js";
import * as stylex from "@stylexjs/stylex";
import { getTutorialDefinition } from "./tutorial-definitions";
import { PrimitivePortal } from "./primitives/primitive-portal";
import { Tooltip } from "./primitives/tooltip";
import { tutorialOverlayStyles as styles } from "./tutorial-overlay.styles";

type TutorialOverlayProps = {
  tutorialId?: string;
  stepIndex: number;
  completionSatisfied: boolean;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
};

type RectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  startedAt: number;
};

const BOUNCE_CLASSES = (stylex.attrs(styles.targetBounce).class ?? "").split(/\s+/).filter(Boolean);

const TutorialPanelContext = createContext<ReturnType<typeof createTutorialPanelState>>();

function createTutorialPanelState(props: TutorialOverlayProps, targetPresent: Accessor<boolean>, targetInteracted: Accessor<boolean>) {
  const tutorial = createMemo(() => getTutorialDefinition(props.tutorialId));
  const step = createMemo(() => tutorial()?.steps[props.stepIndex]);
  const finalStep = createMemo(() => props.stepIndex >= (tutorial()?.steps.length ?? 1) - 1);
  const completionSatisfied = () => props.completionSatisfied;
  const canAdvance = createMemo(() => isTutorialStepAdvanceAllowed({
    finalStep: finalStep(), targetPresent: targetPresent(), targetInteracted: targetInteracted(),
    completionSatisfied: completionSatisfied()
  }));
  return { step, finalStep, completionSatisfied, canAdvance, targetPresent, targetInteracted,
    stepIndex: () => props.stepIndex,
    back: () => props.onBack(), next: () => props.onNext(), close: () => props.onClose() };
}

function TutorialPanel() {
  const state = useContext(TutorialPanelContext);
  if (!state) throw new Error("TutorialPanel requires its overlay scope");
  return (
    <Show when={state.step()}>
      {(step) => (
        <>
          <div {...stylex.attrs(styles.backdrop)} />
          <div {...stylex.attrs(styles.panel)}>
            <div {...stylex.attrs(styles.eyebrow)}>Guided tutorial</div>
            <div {...stylex.attrs(styles.title)}>{step().title}</div>
            <div {...stylex.attrs(styles.body)}>{step().body}</div>
            <Show when={!state.targetPresent()}>
              <div {...stylex.attrs(styles.fallback)}>{step().fallback}</div>
            </Show>
            <Show when={state.targetPresent() && !state.targetInteracted() && !state.finalStep()}>
              <div {...stylex.attrs(styles.requirement)}>Use the highlighted control to unlock the next step.</div>
            </Show>
            <Show when={state.finalStep() && !state.completionSatisfied()}>
              <div {...stylex.attrs(styles.requirement)}>Complete the tutorial goal in the workspace to unlock Finish.</div>
            </Show>
            <div {...stylex.attrs(styles.actions)}>
              <Tooltip content={state.stepIndex() === 0 ? "Already at the first tutorial step" : "Go to previous tutorial step"}>
                <span {...stylex.attrs(styles.tooltipTrigger)}>
                  <button
                    {...stylex.attrs(styles.button, styles.buttonSecondary)}
                    type="button"
                    onClick={state.back}
                    disabled={state.stepIndex() === 0}
                  >
                    Back
                  </button>
                </span>
              </Tooltip>
              <button
                {...stylex.attrs(styles.button)}
                type="button"
                onClick={state.next}
                disabled={!state.canAdvance()}
              >
                {state.finalStep() ? "Finish" : "Next"}
              </button>
              <button {...stylex.attrs(styles.button, styles.buttonSecondary)} type="button" onClick={state.close}>
                Skip
              </button>
            </div>
          </div>
        </>
      )}
    </Show>
  );
}

export function TutorialOverlay(props: TutorialOverlayProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let animationFrame = 0;
  let retryTimer: number | undefined;
  let bounceTimer: number | undefined;
  let bounceTarget: HTMLElement | undefined;
  let targetElement: HTMLElement | undefined;
  const [targetRect, setTargetRect] = createSignal<RectSnapshot>();
  const [targetPresent, setTargetPresent] = createSignal(false);
  const [targetInteracted, setTargetInteracted] = createSignal(false);
  const [stepStartedAt, setStepStartedAt] = createSignal(Date.now());
  const [particles, setParticles] = createSignal<Particle[]>([]);
  // One overlay mount owns animation resources; tutorial/step changes reset only
  // interaction evidence. Panel consumers read the same live scope at use.
  const panel = createTutorialPanelState(props, targetPresent, targetInteracted);
  const currentStep = panel.step;

  onMount(() => {
    const dismissFromEscape = (event: KeyboardEvent) => {
      dismissTutorialFromEscape(event, Boolean(props.tutorialId && currentStep()), props.onClose);
    };
    window.addEventListener("keydown", dismissFromEscape, true);
    onCleanup(() => window.removeEventListener("keydown", dismissFromEscape, true));
  });

  const cleanupBounce = () => {
    if (bounceTimer !== undefined) {
      window.clearTimeout(bounceTimer);
      bounceTimer = undefined;
    }
    if (bounceTarget) {
      applyBounceTone(bounceTarget, false);
      bounceTarget = undefined;
    }
  };

  const syncTarget = () => {
    const step = currentStep();
    if (!step) {
      targetElement = undefined;
      setTargetPresent(false);
      setTargetRect(undefined);
      return;
    }

    const element = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
    if (!element) {
      targetElement = undefined;
      setTargetPresent(false);
      setTargetRect(undefined);
      return;
    }

    const rect = element.getBoundingClientRect();
    targetElement = element;
    setTargetPresent(true);
    setTargetRect({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    });
  };

  createEffect(() => {
    props.tutorialId;
    props.stepIndex;
    setParticles([]);
    setTargetInteracted(false);
    setStepStartedAt(Date.now());
    cleanupBounce();
    syncTarget();
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) {
        syncTarget();
      }
    });

    if (retryTimer !== undefined) {
      window.clearInterval(retryTimer);
    }

    retryTimer = window.setInterval(syncTarget, 250);
    const recordTargetInteraction = (event: Event) => {
      if (targetElement && event.target instanceof Node && targetElement.contains(event.target)) {
        setTargetInteracted(true);
      }
    };
    const recordTargetKeyInteraction = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        recordTargetInteraction(event);
      }
    };
    document.addEventListener("click", recordTargetInteraction, true);
    document.addEventListener("keydown", recordTargetKeyInteraction, true);
    onCleanup(() => {
      disposed = true;
      if (retryTimer !== undefined) {
        window.clearInterval(retryTimer);
      }
      cleanupBounce();
      document.removeEventListener("click", recordTargetInteraction, true);
      document.removeEventListener("keydown", recordTargetKeyInteraction, true);
    });
  });

  createEffect(() => {
    const step = currentStep();
    if (!step || !targetPresent()) {
      return;
    }

    const elapsed = Date.now() - stepStartedAt();
    if (elapsed < 1000 || particles().length > 0) {
      return;
    }

    const rect = targetRect();
    if (!rect) {
      return;
    }

    setParticles(createBurstParticles(rect));
    const target = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`);
    if (target) {
      bounceTarget = target;
      applyBounceTone(target, true);
      bounceTimer = window.setTimeout(() => {
        applyBounceTone(target, false);
        if (bounceTarget === target) {
          bounceTarget = undefined;
        }
        bounceTimer = undefined;
      }, 750);
    }
  });

  createEffect(() => {
    if (!props.tutorialId) {
      return;
    }

    const render = () => {
      drawOverlay(canvasRef, targetRect(), targetPresent(), particles());
      setParticles((current) => current.filter((particle) => Date.now() - particle.startedAt < particle.lifeMs));
      animationFrame = window.requestAnimationFrame(render);
    };

    resizeCanvas(canvasRef);
    // The first frame mutates particle state. Keep it outside this effect's
    // dependency tracking so the mutation cannot synchronously recurse.
    untrack(render);
    const handleResize = () => {
      resizeCanvas(canvasRef);
      syncTarget();
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", syncTarget, true);
    onCleanup(() => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", syncTarget, true);
      window.cancelAnimationFrame(animationFrame);
    });
  });

  return (
    <PrimitivePortal active={Boolean(props.tutorialId && currentStep())} layer="tutorial">
      <div {...stylex.attrs(styles.shell)}>
        <canvas ref={canvasRef} {...stylex.attrs(styles.canvas)} />
        <TutorialPanelContext.Provider value={panel}>
          <TutorialPanel />
        </TutorialPanelContext.Provider>
      </div>
    </PrimitivePortal>
  );
}

export function dismissTutorialFromEscape(event: KeyboardEvent, active: boolean, onClose: () => void) {
  if (!active || event.key !== "Escape") return false;
  event.preventDefault();
  event.stopPropagation();
  onClose();
  return true;
}

export function isTutorialStepAdvanceAllowed(input: {
  finalStep: boolean;
  targetPresent: boolean;
  targetInteracted: boolean;
  completionSatisfied: boolean;
}) {
  return input.finalStep
    ? input.completionSatisfied
    : input.targetPresent && input.targetInteracted;
}

function resizeCanvas(canvas: HTMLCanvasElement | undefined) {
  if (!canvas) {
    return;
  }

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function drawOverlay(
  canvas: HTMLCanvasElement | undefined,
  rect: RectSnapshot | undefined,
  targetPresent: boolean,
  particles: Particle[]
) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(0, 0, 0, 0.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (targetPresent && rect) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const radius = Math.max(rect.width, rect.height) * 0.62 + 20;
    const pulse = 1 + Math.sin(Date.now() / 220) * 0.045;

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    context.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const gradient = context.createRadialGradient(centerX, centerY, radius * 0.55, centerX, centerY, radius * 1.15);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(centerX, centerY, radius * pulse, 0, Math.PI * 2);
    context.stroke();
  }

  for (const particle of particles) {
    const progress = (Date.now() - particle.startedAt) / particle.lifeMs;
    const alpha = Math.max(0, 1 - progress);
    context.fillStyle = `rgba(255, 236, 168, ${alpha})`;
    context.beginPath();
    context.arc(particle.x + particle.vx * progress, particle.y + particle.vy * progress, 2.2, 0, Math.PI * 2);
    context.fill();
  }
}

function createBurstParticles(rect: RectSnapshot) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.max(rect.width, rect.height) * 0.62 + 20;
  return Array.from({ length: 24 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 24;
    const velocity = 36 + (index % 5) * 14;
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      lifeMs: 900,
      startedAt: Date.now()
    };
  });
}

function applyBounceTone(element: HTMLElement, active: boolean) {
  const bounceClasses = new Set(BOUNCE_CLASSES);
  const baseClasses = element.className.split(/\s+/).filter((className) => className && !bounceClasses.has(className));
  element.className = [...baseClasses, ...(active ? BOUNCE_CLASSES : [])].join(" ");
}
