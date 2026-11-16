export const DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS = [2_500, 5_000, 10_000, 15_000] as const;
export const DEV_LIVE_RELOAD_ENDPOINT = "/__dev/reload-state";

export type DevHmrTimerApi = {
  setTimeout(callback: () => void, delayMs?: number): number;
  clearTimeout(timerId: number): void;
};

type CreateDevHmrBatcherOptions = {
  reload: (reasons: readonly string[]) => void | Promise<void>;
  scheduleMs?: readonly number[];
  timerApi?: DevHmrTimerApi;
  onError?: (error: unknown) => void;
};

export function createDevHmrBatcher(options: CreateDevHmrBatcherOptions) {
  const scheduleMs = normalizeDevHmrSchedule(options.scheduleMs ?? DEFAULT_DEV_HMR_DEBOUNCE_SCHEDULE_MS);
  const timerApi = options.timerApi ?? createDefaultTimerApi();
  const reasons = new Set<string>();
  let timerId: number | undefined;
  let backoffStep = 0;

  const cancelTimer = () => {
    if (timerId === undefined) return;
    timerApi.clearTimeout(timerId);
    timerId = undefined;
  };

  const run = () => {
    timerId = undefined;
    backoffStep = 0;
    const pendingReasons = [...reasons];
    reasons.clear();
    Promise.resolve(options.reload(pendingReasons)).catch(options.onError ?? (() => {}));
  };

  return {
    request(reason: string) {
      reasons.add(reason);
      cancelTimer();
      const delayMs = scheduleMs[Math.min(backoffStep, scheduleMs.length - 1)] ?? 0;
      backoffStep += 1;
      if (delayMs === 0) {
        run();
        return;
      }
      timerId = timerApi.setTimeout(run, delayMs);
    },
    cancel() {
      cancelTimer();
      reasons.clear();
      backoffStep = 0;
    },
    getState() {
      return {
        pending: timerId !== undefined,
        pendingReasonCount: reasons.size,
        nextDelayMs: scheduleMs[Math.min(backoffStep, scheduleMs.length - 1)] ?? 0
      };
    }
  };
}

export function normalizeDevHmrSchedule(scheduleMs: readonly number[]) {
  const normalized = scheduleMs
    .map((delayMs) => Math.max(0, Math.round(delayMs)))
    .filter((delayMs) => Number.isFinite(delayMs));
  return normalized.length > 0 ? normalized : [0];
}

export function injectDevLiveReloadScript(
  html: string,
  endpoint = DEV_LIVE_RELOAD_ENDPOINT
) {
  const script = `<script>(()=>{let revision;const poll=async()=>{try{const response=await fetch(${JSON.stringify(endpoint)},{cache:"no-store"});if(response.ok){const next=await response.text();if(revision!==undefined&&next!==revision){if(dispatchEvent(new Event("hyperfocus:before-dev-reload",{cancelable:true}))){revision=next;location.reload();}}else revision=next;}}catch{}setTimeout(poll,500)};void poll()})()</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : `${html}${script}`;
}

function createDefaultTimerApi(): DevHmrTimerApi {
  let nextTimerId = 1;
  const timers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  return {
    setTimeout(callback, delayMs = 0) {
      const timerId = nextTimerId++;
      timers.set(timerId, globalThis.setTimeout(() => {
        timers.delete(timerId);
        callback();
      }, delayMs));
      return timerId;
    },
    clearTimeout(timerId) {
      const timer = timers.get(timerId);
      if (timer === undefined) return;
      globalThis.clearTimeout(timer);
      timers.delete(timerId);
    }
  };
}
