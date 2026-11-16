import { init, type InitApp, type InitOptions } from "../canvas/bootstrap.ts";
import { createKeyboardActions, type KeyboardBindings, type KeyboardState } from "../input/keyboard.ts";
import { createFixedStepLoop } from "./loop.ts";
import { createFrameMetrics, type FrameMetrics, type FrameMetricsOptions } from "./frame-metrics.ts";

export type BrowserAppContext = {
  app: InitApp;
  input?: KeyboardState;
  metrics?: FrameMetrics;
  simulationTime: number;
};

export type BrowserAppOptions = Omit<InitOptions, "autoStart" | "globals" | "update" | "render"> & {
  step?: number;
  maxFrame?: number;
  autoStart?: boolean;
  input?: KeyboardBindings | false;
  metrics?: FrameMetrics | FrameMetricsOptions | false;
  beforeUpdate?: (context: BrowserAppContext, step: number) => void;
  update: (context: BrowserAppContext, step: number) => void;
  render: (context: BrowserAppContext, alpha: number) => void;
  now?: () => number;
};

export type BrowserApp = BrowserAppContext & {
  start(): void;
  stop(): void;
  destroy(): void;
  isRunning(): boolean;
  resolvedConfig(): Readonly<{ step: number; maxFrame: number; autoStart: boolean; input: boolean; metrics: boolean }>;
};

function isFrameMetrics(value: FrameMetrics | FrameMetricsOptions): value is FrameMetrics {
  return typeof Reflect.get(value, "record") === "function" && typeof Reflect.get(value, "snapshot") === "function";
}

export function createBrowserApp(options: BrowserAppOptions): BrowserApp {
  const step = options.step ?? 0.016666666666666666;
  const maxFrame = options.maxFrame ?? 0.05;
  const autoStart = options.autoStart ?? false;
  const now = options.now ?? (() => performance.now());
  const {
    input: inputOptions,
    metrics: metricsOptions,
    beforeUpdate,
    update,
    render,
    step: _step,
    maxFrame: _maxFrame,
    autoStart: _autoStart,
    now: _now,
    ...canvasOptions
  } = options;
  const app = init({ ...canvasOptions, autoStart: false, globals: false });
  const input = inputOptions === false || inputOptions === undefined ? undefined : createKeyboardActions(inputOptions);
  const metrics = metricsOptions === false || metricsOptions === undefined
    ? undefined
    : isFrameMetrics(metricsOptions) ? metricsOptions : createFrameMetrics({ ...metricsOptions, now });
  let simulationTime = 0;
  let updateWorkMs = 0;
  let beforeUpdateWorkMs = 0;
  let updatesThisFrame = 0;
  let lastRenderAt: number | undefined;
  let destroyed = false;
  const context = { app, input, metrics, simulationTime };

  const loop = createFixedStepLoop({
    step,
    maxFrame,
    now,
    beforeUpdate(currentStep) {
      const startedAt = metrics ? now() : 0;
      try { beforeUpdate?.(context, currentStep); }
      finally { if (metrics) beforeUpdateWorkMs += Math.max(0, now() - startedAt); }
    },
    update(currentStep) {
      const startedAt = metrics ? now() : 0;
      try {
        simulationTime += currentStep;
        context.simulationTime = simulationTime;
        update(context, currentStep);
      } finally {
        input?.update();
        if (metrics) {
          updateWorkMs += Math.max(0, now() - startedAt);
          updatesThisFrame += 1;
        }
      }
    },
    render(alpha) {
      const startedAt = metrics ? now() : 0;
      if (metrics) {
        if (lastRenderAt !== undefined) metrics.record("frame.gap.ms", Math.max(0, startedAt - lastRenderAt));
        lastRenderAt = startedAt;
      }
      try {
        render(context, alpha);
      } finally {
        if (metrics) {
          const renderMs = Math.max(0, now() - startedAt);
          metrics.record("update.ms", updateWorkMs);
          metrics.record("before-update.ms", beforeUpdateWorkMs);
          metrics.record("render.ms", renderMs);
          metrics.record("frame.ms", beforeUpdateWorkMs + updateWorkMs + renderMs);
          metrics.record("updates.per-frame", updatesThisFrame);
          updateWorkMs = 0;
          beforeUpdateWorkMs = 0;
          updatesThisFrame = 0;
        }
      }
    }
  });

  const api: BrowserApp = {
    app,
    input,
    metrics,
    get simulationTime() {
      return simulationTime;
    },
    start() {
      if (destroyed) throw new Error("Cannot start a destroyed browser app");
      if (loop.isRunning()) return;
      lastRenderAt = undefined;
      updateWorkMs = beforeUpdateWorkMs = updatesThisFrame = 0;
      loop.start();
    },
    stop: loop.stop,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      loop.stop();
      input?.dispose();
      app.destroy();
    },
    isRunning: loop.isRunning,
    resolvedConfig() {
      return Object.freeze({ step, maxFrame, autoStart, input: Boolean(input), metrics: Boolean(metrics) });
    }
  };
  if (autoStart) api.start();
  return api;
}
