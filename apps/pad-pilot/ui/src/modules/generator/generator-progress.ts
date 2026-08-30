import type { SetStoreFunction } from "solid-js/store";

export type GeneratorRunState = {
  logs: string[];
  progress: number;
  status: "error" | "idle" | "loading" | "ready";
};

export const GENERATOR_PROGRESS_READY_CAP = 100;
export const GENERATOR_PROGRESS_START = 4.5;

const GENERATOR_PROGRESS_COMPLETE_MS = 420;
const GENERATOR_PROGRESS_LOADING_CAP = 97.5;
const GENERATOR_PROGRESS_PER_SECOND = 1.15;
const GENERATOR_PROGRESS_LOG_MS = 1800;
const progressLogLines = [
  "still working: waiting on model tokens",
  "still working: validating tracker syntax",
  "still working: preparing style massage",
  "still working: shaping groove lanes",
  "still working: checking MIDI export bounds",
];

export function lineTimestamp() {
  return new Date().toLocaleTimeString([], {
    hour12: false,
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createGeneratorProgress(options: {
  addLog: (line: string) => void;
  run: GeneratorRunState;
  setRun: SetStoreFunction<GeneratorRunState>;
}) {
  const { addLog, run, setRun } = options;
  let completeFrame: number | null = null;
  let completeCancel: (() => void) | null = null;
  let completeTimer: number | null = null;
  let progressLogIndex = 0;
  let progressLogTimer: number | null = null;
  let progressFrame: number | null = null;
  let progressStartedAt = 0;
  let progressLastAt = 0;

  const stopProgressAnimation = () => {
    if (progressFrame === null) return;
    window.cancelAnimationFrame(progressFrame);
    progressFrame = null;
  };

  const stopCompletionAnimation = () => {
    const cancel = completeCancel;
    completeCancel = null;
    if (cancel) {
      cancel();
      return;
    }
    if (completeFrame !== null) {
      window.cancelAnimationFrame(completeFrame);
      completeFrame = null;
    }
    if (completeTimer !== null) {
      window.clearTimeout(completeTimer);
      completeTimer = null;
    }
  };

  const stopProgressLogPump = () => {
    if (progressLogTimer === null) return;
    window.clearInterval(progressLogTimer);
    progressLogTimer = null;
  };

  const stopProgressWork = () => {
    stopProgressAnimation();
    stopCompletionAnimation();
    stopProgressLogPump();
  };

  const startProgressLogPump = () => {
    stopProgressLogPump();
    progressLogIndex = 0;
    progressLogTimer = window.setInterval(() => {
      addLog(progressLogLines[progressLogIndex % progressLogLines.length] ?? "still working");
      progressLogIndex += 1;
    }, GENERATOR_PROGRESS_LOG_MS);
  };

  const startProgressAnimation = () => {
    stopProgressAnimation();
    progressStartedAt = window.performance.now();
    progressLastAt = progressStartedAt;
    const tick = (now: number) => {
      const elapsedSeconds = Math.max(0.001, (now - progressLastAt) / 1000);
      const target = Math.min(
        GENERATOR_PROGRESS_LOADING_CAP,
        GENERATOR_PROGRESS_START + ((now - progressStartedAt) / 1000) * GENERATOR_PROGRESS_PER_SECOND
      );
      progressLastAt = now;
      setRun("progress", (progress) => {
        const lerpAmount = Math.min(1, elapsedSeconds * 1.6);
        return Math.min(
          GENERATOR_PROGRESS_LOADING_CAP,
          progress + (target - progress) * lerpAmount
        );
      });
      progressFrame = window.requestAnimationFrame(tick);
    };
    progressFrame = window.requestAnimationFrame(tick);
  };

  const completeProgressAnimation = () => new Promise<boolean>((resolve) => {
    stopProgressAnimation();
    stopCompletionAnimation();
    const startValue = run.progress;
    const startAt = window.performance.now();
    let finished = false;
    const settle = (completed: boolean) => {
      if (finished) return;
      finished = true;
      if (completeFrame !== null) {
        window.cancelAnimationFrame(completeFrame);
        completeFrame = null;
      }
      if (completeTimer !== null) {
        window.clearTimeout(completeTimer);
        completeTimer = null;
      }
      completeCancel = null;
      if (completed) setRun("progress", GENERATOR_PROGRESS_READY_CAP);
      resolve(completed);
    };
    const finish = () => settle(true);
    completeCancel = () => settle(false);
    const tick = (now: number) => {
      const ratio = Math.min(1, (now - startAt) / GENERATOR_PROGRESS_COMPLETE_MS);
      const eased = 1 - (1 - ratio) ** 3;
      setRun("progress", startValue + (GENERATOR_PROGRESS_READY_CAP - startValue) * eased);
      if (ratio >= 1) {
        finish();
        return;
      }
      completeFrame = window.requestAnimationFrame(tick);
    };
    completeTimer = window.setTimeout(finish, GENERATOR_PROGRESS_COMPLETE_MS + 80);
    completeFrame = window.requestAnimationFrame(tick);
  });

  return {
    completeProgressAnimation,
    startProgressAnimation,
    startProgressLogPump,
    stopProgressAnimation,
    stopProgressLogPump,
    stopProgressWork,
  };
}
