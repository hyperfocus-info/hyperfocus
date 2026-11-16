/** Browser frame pacing. Timer mode uncaps submission, not the compositor's swap interval. */
export function createGameFrameScheduler(options: {
  frame(time: number): void;
  vsync(): boolean;
  raf?: typeof requestAnimationFrame;
  cancelRaf?: typeof cancelAnimationFrame;
  timer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancelTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  now?: () => number;
}) {
  const raf = options.raf ?? requestAnimationFrame, cancelRaf = options.cancelRaf ?? cancelAnimationFrame;
  const timer: NonNullable<Parameters<typeof createGameFrameScheduler>[0]['timer']> = options.timer ?? setTimeout;
  const cancelTimer = options.cancelTimer ?? clearTimeout;
  let animation: number | undefined, timeout: ReturnType<typeof setTimeout> | undefined, disposed = false, running = false;
  function cancel() {
    if (animation !== undefined) cancelRaf(animation);
    if (timeout !== undefined) cancelTimer(timeout);
    animation = undefined;timeout = undefined;
  }
  const run = (time: number) => {
    animation = undefined;timeout = undefined;if (disposed) return;
    running = true;try { options.frame(time); } finally { running = false; }
  };
  return {
    schedule(delayMs = 0) {
      if (disposed || animation !== undefined || timeout !== undefined) return;
      if (options.vsync()) animation = raf(run);
      else timeout = timer(() => run((options.now ?? performance.now.bind(performance))()), delayMs);
    },
    /** A completed worker frame can use this message task instead of waiting for a timer.
     * VSync still owns presentation when enabled; never reenter an active frame. */
    wake() {
      if (disposed) return;
      if (running || options.vsync()) { this.schedule();return; }
      cancel();run((options.now ?? performance.now.bind(performance))());
    },
    cancel,
    dispose() { disposed = true;cancel(); },
  };
}
