export type ServerClockTick = { dt: number; now: number; driftMs: number; tick: number };
export type ServerClockBacklogPolicy = "coalesce" | "drop" | "queue";
export type ServerClockOptions = {
  tickRate?: number;
  maxCatchUpTicks?: number;
  backlogPolicy?: ServerClockBacklogPolicy;
  maxPendingTicks?: number;
  now?: () => number;
  onTick?: (tick: ServerClockTick) => void | Promise<void>;
  onError?: (error: unknown, tick: ServerClockTick) => void;
};
export type ServerClockStats = {
  tick: number; tickRate: number; stepMs: number; lastDriftMs: number; pendingTicks: number;
  droppedTicks: number; coalescedTicks: number; backlogPolicy: ServerClockBacklogPolicy;
};
export type ServerClock = { start(): void; stop(): void; advance(time?: number): number; isRunning(): boolean; getStats(): ServerClockStats };

export function createServerClock(options: ServerClockOptions = {}): ServerClock {
  const tickRate = options.tickRate ?? 20;
  const maxCatchUpTicks = options.maxCatchUpTicks ?? 3;
  const backlogPolicy = options.backlogPolicy ?? "coalesce";
  const maxPendingTicks = options.maxPendingTicks ?? (backlogPolicy === "queue" ? 32 : 1);
  if (!Number.isFinite(tickRate) || tickRate <= 0) throw new Error("tickRate must be a finite positive number");
  if (!Number.isSafeInteger(maxCatchUpTicks) || maxCatchUpTicks < 0) throw new Error("maxCatchUpTicks must be a non-negative safe integer");
  if (!Number.isSafeInteger(maxPendingTicks) || maxPendingTicks < 0) throw new Error("maxPendingTicks must be a non-negative safe integer");
  if (backlogPolicy !== "coalesce" && backlogPolicy !== "drop" && backlogPolicy !== "queue") throw new Error("invalid server clock backlogPolicy");
  const now = options.now ?? (() => performance.now());
  const finiteTime = (value: number) => { if (!Number.isFinite(value)) throw new RangeError("server clock time must be finite"); return value; };
  const stepMs = 1000 / tickRate;
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let last = finiteTime(now());
  let accumulator = 0;
  let tick = 0;
  let lastDriftMs = 0;
  const pendingTicks: ServerClockTick[] = [];
  let callbackActive = false;
  let droppedTicks = 0;
  let coalescedTicks = 0;

  function reportError(error: unknown, clockTick: ServerClockTick) {
    try { if (options.onError) options.onError(error, clockTick); else console.error("server clock tick failed", error); }
    catch (reportingError) { console.error("server clock error handler failed", reportingError); }
  }

  function drain() {
    if (callbackActive || !options.onTick) return;
    while (pendingTicks.length > 0) {
      const clockTick = pendingTicks.shift()!;
      let result: void | Promise<void>;
      try { result = options.onTick(clockTick); } catch (error) { reportError(error, clockTick); continue; }
      if (result && typeof (result as Promise<void>).then === "function") {
        callbackActive = true;
        void Promise.resolve(result).catch((error) => reportError(error, clockTick)).finally(() => { callbackActive = false; drain(); });
        return;
      }
    }
  }

  function enqueue(clockTick: ServerClockTick) {
    if (!callbackActive) { pendingTicks.push(clockTick); drain(); return; }
    if (backlogPolicy === "drop" || maxPendingTicks === 0) { droppedTicks += 1; return; }
    if (backlogPolicy === "coalesce") {
      if (pendingTicks.length > 0) coalescedTicks += 1;
      pendingTicks[0] = clockTick;
      pendingTicks.length = 1;
      return;
    }
    if (pendingTicks.length >= maxPendingTicks) { droppedTicks += 1; return; }
    pendingTicks.push(clockTick);
  }

  function advance(time = now()) {
    finiteTime(time);
    const elapsed = Math.max(0, time - last);
    last = time;
    accumulator += elapsed;
    const availableTicks = Math.floor(accumulator / stepMs);
    const ticksToRun = Math.min(availableTicks, maxCatchUpTicks);
    if (availableTicks > maxCatchUpTicks) accumulator = 0;
    else accumulator -= ticksToRun * stepMs;
    for (let index = 0; index < ticksToRun; index += 1) {
      tick += 1;
      lastDriftMs = accumulator;
      enqueue({ dt: 1 / tickRate, now: time, driftMs: lastDriftMs, tick });
    }
    return ticksToRun;
  }

  return {
    start() { if (running) return; last = finiteTime(now()); running = true; timer = setInterval(() => advance(), Math.max(1, Math.floor(stepMs * 0.5))); },
    stop() { running = false; if (timer) clearInterval(timer); timer = undefined; accumulator = 0; pendingTicks.length = 0; },
    advance,
    isRunning() { return running; },
    getStats() { return { tick, tickRate, stepMs, lastDriftMs, pendingTicks: pendingTicks.length, droppedTicks, coalescedTicks, backlogPolicy }; }
  };
}
