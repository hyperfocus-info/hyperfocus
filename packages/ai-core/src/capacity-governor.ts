export type CapacityResources = Readonly<Record<string, number>>;
export type CapacityScheduling = "fifo" | "work-conserving";

export type CapacityRateLimit = {
  capacity: number;
  intervalMs: number;
};

export type CapacityGovernorOptions = {
  capacities: CapacityResources;
  maxQueued?: number;
  scheduling?: CapacityScheduling;
  maxBypasses?: number;
  rateLimits?: Readonly<Record<string, CapacityRateLimit>>;
  now?: () => number;
};

export type CapacityAcquireOptions = {
  resources: CapacityResources;
  rateCosts?: CapacityResources;
  signal?: AbortSignal;
};

export type CapacityLease = {
  readonly resources: CapacityResources;
  readonly released: boolean;
  release(): void;
};

export type CapacityGovernorMetrics = {
  requested: number;
  admitted: number;
  released: number;
  queued: number;
  cancelled: number;
  rejected: number;
  queueScans: number;
  bypasses: number;
  peakQueued: number;
  rateDeferred: number;
  cooldowns: number;
  capacityChanges: number;
};

export type CapacityGovernorSnapshot = {
  capacities: CapacityResources;
  used: CapacityResources;
  rateLimits: Readonly<Record<string, CapacityRateLimit>>;
  rateUsage: CapacityResources;
  cooldownUntil: Readonly<Record<string, number>>;
  queued: number;
  metrics: Readonly<CapacityGovernorMetrics>;
};

export type CapacityGovernor = {
  acquire(options: CapacityAcquireOptions): Promise<CapacityLease>;
  run<Result>(options: CapacityAcquireOptions, task: () => Result | Promise<Result>): Promise<Result>;
  setCapacity(resource: string, capacity: number): void;
  defer(resource: string, durationMs: number): void;
  snapshot(): CapacityGovernorSnapshot;
};

export type CapacityLeaseRegistry = {
  readonly size: number;
  acquire(options: CapacityAcquireOptions & { key: string }): Promise<void>;
  release(key: string): boolean;
  has(key: string): boolean;
};

type QueueNode = {
  resources: Record<string, number>;
  rateCosts: Record<string, number>;
  resolve: (lease: CapacityLease) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abort?: () => void;
  bypasses: number;
  previous?: QueueNode;
  next?: QueueNode;
};

export function createCapacityGovernor(options: CapacityGovernorOptions): CapacityGovernor {
  const capacities = normalizeResources(options.capacities, undefined, "capacity");
  const used = Object.fromEntries(Object.keys(capacities).map((name) => [name, 0]));
  const rateLimits = normalizeRateLimits(options.rateLimits ?? {});
  const rateHistory = new Map<string, Array<{ at: number; cost: number }>>();
  const cooldownUntil: Record<string, number> = {};
  const now = options.now ?? Date.now;
  const maxQueued = normalizePositiveInteger(options.maxQueued ?? 4_096, "maxQueued");
  const scheduling = options.scheduling ?? "fifo";
  if (scheduling !== "fifo" && scheduling !== "work-conserving") {
    throw new RangeError(`capacity scheduling must be fifo or work-conserving: ${String(scheduling)}`);
  }
  const maxBypasses = normalizePositiveInteger(options.maxBypasses ?? 8, "maxBypasses");
  const metrics: CapacityGovernorMetrics = {
    requested: 0, admitted: 0, released: 0, queued: 0, cancelled: 0, rejected: 0,
    queueScans: 0, bypasses: 0, peakQueued: 0, rateDeferred: 0, cooldowns: 0,
    capacityChanges: 0
  };
  let head: QueueNode | undefined;
  let tail: QueueNode | undefined;
  let queueSize = 0;
  let processing = false;
  let wakeTimer: ReturnType<typeof setTimeout> | undefined;

  const pruneRateHistory = (name: string, currentTime: number) => {
    const entries = rateHistory.get(name);
    const limit = rateLimits[name];
    if (!entries || !limit) return [];
    let expired = 0;
    while (expired < entries.length && currentTime - entries[expired].at >= limit.intervalMs) expired += 1;
    if (expired > 0) entries.splice(0, expired);
    return entries;
  };

  const rateUsage = (name: string, currentTime: number) =>
    pruneRateHistory(name, currentTime).reduce((total, entry) => total + entry.cost, 0);

  const rateWaitMs = (rateCosts: CapacityResources, currentTime: number) => {
    let waitMs = 0;
    for (const [name, cost] of Object.entries(rateCosts)) {
      const limit = rateLimits[name];
      const entries = pruneRateHistory(name, currentTime);
      const cooldownWait = Math.max(0, (cooldownUntil[name] ?? 0) - currentTime);
      waitMs = Math.max(waitMs, cooldownWait);
      const usedInWindow = entries.reduce((total, entry) => total + entry.cost, 0);
      if (usedInWindow + cost <= limit.capacity) continue;
      let released = 0;
      for (const entry of entries) {
        released += entry.cost;
        if (usedInWindow - released + cost <= limit.capacity) {
          waitMs = Math.max(waitMs, entry.at + limit.intervalMs - currentTime);
          break;
        }
      }
    }
    return waitMs;
  };

  const fits = (resources: CapacityResources, rateCosts: CapacityResources, currentTime: number) => {
    for (const [name, amount] of Object.entries(resources)) {
      if ((used[name] ?? 0) + amount > capacities[name]) return false;
    }
    return rateWaitMs(rateCosts, currentTime) <= 0;
  };

  const scheduleWake = (delayMs: number) => {
    if (wakeTimer !== undefined || !Number.isFinite(delayMs)) return;
    wakeTimer = setTimeout(() => {
      wakeTimer = undefined;
      processQueue();
    }, Math.max(1, Math.ceil(delayMs)));
  };

  const unlink = (node: QueueNode) => {
    if (node.previous) node.previous.next = node.next;
    else head = node.next;
    if (node.next) node.next.previous = node.previous;
    else tail = node.previous;
    node.previous = undefined;
    node.next = undefined;
    queueSize -= 1;
  };

  const releaseResources = (resources: CapacityResources) => {
    for (const [name, amount] of Object.entries(resources)) used[name] -= amount;
    metrics.released += 1;
    processQueue();
  };

  const createLease = (resources: Record<string, number>, rateCosts: Record<string, number>): CapacityLease => {
    for (const [name, amount] of Object.entries(resources)) used[name] += amount;
    const admittedAt = now();
    for (const [name, cost] of Object.entries(rateCosts)) {
      const entries = pruneRateHistory(name, admittedAt);
      entries.push({ at: admittedAt, cost });
      rateHistory.set(name, entries);
    }
    metrics.admitted += 1;
    let released = false;
    return {
      resources,
      get released() { return released; },
      release() {
        if (released) return;
        released = true;
        releaseResources(resources);
      }
    };
  };

  const admit = (node: QueueNode) => {
    unlink(node);
    node.signal?.removeEventListener("abort", node.abort!);
    node.resolve(createLease(node.resources, node.rateCosts));
  };

  function processQueue() {
    if (processing) return;
    if (wakeTimer !== undefined) {
      clearTimeout(wakeTimer);
      wakeTimer = undefined;
    }
    processing = true;
    try {
      while (head) {
        const currentTime = now();
        metrics.queueScans += 1;
        if (fits(head.resources, head.rateCosts, currentTime)) {
          admit(head);
          continue;
        }
        if (scheduling === "fifo" || head.bypasses >= maxBypasses) {
          const waitMs = rateWaitMs(head.rateCosts, currentTime);
          if (waitMs > 0) {
            metrics.rateDeferred += 1;
            scheduleWake(waitMs);
          }
          break;
        }
        let candidate = head.next;
        while (candidate) {
          metrics.queueScans += 1;
          if (fits(candidate.resources, candidate.rateCosts, currentTime)) break;
          candidate = candidate.next;
        }
        if (!candidate) {
          const waitMs = rateWaitMs(head.rateCosts, currentTime);
          if (waitMs > 0) {
            metrics.rateDeferred += 1;
            scheduleWake(waitMs);
          }
          break;
        }
        head.bypasses += 1;
        metrics.bypasses += 1;
        admit(candidate);
      }
    } finally {
      processing = false;
    }
  }

  const acquire = (input: CapacityAcquireOptions) => {
    metrics.requested += 1;
    let resources: Record<string, number>;
    let rateCosts: Record<string, number>;
    try {
      resources = normalizeResources(input.resources, capacities, "request");
      rateCosts = normalizeRateCosts(input.rateCosts ?? {}, rateLimits);
    } catch (error) {
      metrics.rejected += 1;
      return Promise.reject(error);
    }
    if (input.signal?.aborted) {
      metrics.cancelled += 1;
      return Promise.reject(input.signal.reason ?? new DOMException("Capacity request aborted", "AbortError"));
    }
    if (!head && fits(resources, rateCosts, now())) return Promise.resolve(createLease(resources, rateCosts));
    if (queueSize >= maxQueued) {
      metrics.rejected += 1;
      return Promise.reject(new Error(`capacity queue limit ${maxQueued} exceeded`));
    }
    return new Promise<CapacityLease>((resolve, reject) => {
      const node: QueueNode = { resources, rateCosts, resolve, reject, signal: input.signal, bypasses: 0 };
      node.abort = () => {
        unlink(node);
        metrics.cancelled += 1;
        reject(input.signal?.reason ?? new DOMException("Capacity request aborted", "AbortError"));
        processQueue();
      };
      if (tail) {
        tail.next = node;
        node.previous = tail;
      } else head = node;
      tail = node;
      queueSize += 1;
      metrics.queued += 1;
      metrics.peakQueued = Math.max(metrics.peakQueued, queueSize);
      input.signal?.addEventListener("abort", node.abort, { once: true });
      processQueue();
    });
  };

  return {
    acquire,
    async run<Result>(input: CapacityAcquireOptions, task: () => Result | Promise<Result>) {
      const lease = await acquire(input);
      try { return await task(); }
      finally { lease.release(); }
    },
    setCapacity(resource, capacity) {
      if (!(resource in capacities)) throw new RangeError(`unknown capacity resource ${resource}`);
      capacities[resource] = normalizePositiveInteger(capacity, `capacity ${resource}`);
      metrics.capacityChanges += 1;
      processQueue();
    },
    defer(resource, durationMs) {
      if (!(resource in rateLimits)) throw new RangeError(`unknown rate resource ${resource}`);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        throw new RangeError("capacity defer durationMs must be a non-negative finite number");
      }
      cooldownUntil[resource] = Math.max(cooldownUntil[resource] ?? 0, now() + durationMs);
      metrics.cooldowns += 1;
      if (head) scheduleWake(durationMs);
    },
    snapshot() {
      const currentTime = now();
      return {
        capacities: { ...capacities },
        used: { ...used },
        rateLimits: Object.fromEntries(Object.entries(rateLimits).map(([name, limit]) => [name, { ...limit }])),
        rateUsage: Object.fromEntries(Object.keys(rateLimits).map((name) => [name, rateUsage(name, currentTime)])),
        cooldownUntil: { ...cooldownUntil },
        queued: queueSize,
        metrics: { ...metrics }
      };
    }
  };
}

/** Holds capacity across externally reported start/end events using stable keys. */
export function createCapacityLeaseRegistry(options: { governor: CapacityGovernor }): CapacityLeaseRegistry {
  const held = new Map<string, { lease: CapacityLease; signal?: AbortSignal; abort?: () => void }>();
  const pending = new Set<string>();
  const release = (key: string) => {
    const entry = held.get(key);
    if (!entry) return false;
    held.delete(key);
    if (entry.signal && entry.abort) entry.signal.removeEventListener("abort", entry.abort);
    entry.lease.release();
    return true;
  };
  return {
    get size() { return held.size; },
    has(key) { return held.has(key) || pending.has(key); },
    async acquire({ key, ...request }) {
      if (!key) throw new Error("Capacity lease registry keys must be non-empty.");
      if (held.has(key) || pending.has(key)) throw new Error(`Capacity is already held or pending for ${key}`);
      pending.add(key);
      try {
        const lease = await options.governor.acquire(request);
        if (request.signal?.aborted) {
          lease.release();
          throw request.signal.reason ?? new DOMException("Capacity request aborted", "AbortError");
        }
        const abort = request.signal ? () => release(key) : undefined;
        held.set(key, { lease, signal: request.signal, abort });
        if (request.signal && abort) request.signal.addEventListener("abort", abort, { once: true });
      } finally {
        pending.delete(key);
      }
    },
    release
  };
}

function normalizeRateLimits(input: Readonly<Record<string, CapacityRateLimit>>) {
  const normalized: Record<string, CapacityRateLimit> = {};
  for (const [name, limit] of Object.entries(input)) {
    if (!name || !Number.isSafeInteger(limit.capacity) || limit.capacity < 1) {
      throw new RangeError(`rate limit ${name || "<empty>"} capacity must be a positive safe integer`);
    }
    if (!Number.isFinite(limit.intervalMs) || limit.intervalMs <= 0) {
      throw new RangeError(`rate limit ${name} intervalMs must be a positive finite number`);
    }
    normalized[name] = { ...limit };
  }
  return normalized;
}

function normalizeRateCosts(input: CapacityResources, limits: Readonly<Record<string, CapacityRateLimit>>) {
  const normalized: Record<string, number> = {};
  for (const [name, cost] of Object.entries(input)) {
    if (!(name in limits)) throw new RangeError(`request rate resource ${name} is not configured`);
    if (!Number.isSafeInteger(cost) || cost < 1 || cost > limits[name].capacity) {
      throw new RangeError(`request rate resource ${name} exceeds configured window capacity`);
    }
    normalized[name] = cost;
  }
  return normalized;
}

function normalizeResources(input: CapacityResources, capacities: CapacityResources | undefined, label: string) {
  const entries = Object.entries(input);
  if (entries.length === 0) throw new RangeError(`${label} must include at least one resource`);
  const normalized: Record<string, number> = {};
  for (const [name, amount] of entries) {
    if (!name || !Number.isSafeInteger(amount) || amount < 1) {
      throw new RangeError(`${label} resource ${name || "<empty>"} must be a positive safe integer`);
    }
    if (capacities && (!(name in capacities) || amount > capacities[name])) {
      throw new RangeError(`${label} resource ${name} exceeds configured capacity`);
    }
    normalized[name] = amount;
  }
  return normalized;
}

function normalizePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}
