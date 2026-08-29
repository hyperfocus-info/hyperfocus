export type TimerApi = {
  setTimeout(callback: () => void, delay?: number): number;
  clearTimeout(timerId: number): void;
};

export function createTimerApi(): TimerApi {
  let nextTimerId = 1;
  const timers = new Map<number, ReturnType<typeof globalThis.setTimeout>>();
  return {
    setTimeout(callback, delay = 0) {
      const timerId = nextTimerId++;
      timers.set(timerId, globalThis.setTimeout(() => {
        timers.delete(timerId);
        callback();
      }, delay));
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
