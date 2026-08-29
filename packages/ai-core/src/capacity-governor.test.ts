import { describe, expect, test } from "bun:test";
import { createCapacityGovernor, createCapacityLeaseRegistry } from "./capacity-governor";

describe("capacity governor", () => {
  test("atomically bounds mixed resources across one thousand contending tasks", async () => {
    const governor = createCapacityGovernor({ capacities: { agent: 32, provider: 16, branchfs: 8, browser: 2 } });
    const active: Record<string, number> = { agent: 0, provider: 0, branchfs: 0, browser: 0 };
    const peak: Record<string, number> = { ...active };
    await Promise.all(Array.from({ length: 1_000 }, (_, index) => {
      const resources: Record<string, number> = index % 10 === 0
        ? { agent: 1, provider: 1, branchfs: 1, browser: 1 }
        : { agent: 1, provider: 1, branchfs: 1 };
      return governor.run({ resources }, async () => {
        for (const [name, amount] of Object.entries(resources)) {
          active[name] = (active[name] ?? 0) + amount;
          peak[name] = Math.max(peak[name] ?? 0, active[name]);
        }
        await Promise.resolve();
        for (const [name, amount] of Object.entries(resources)) active[name] = (active[name] ?? 0) - amount;
      });
    }));

    expect(peak.agent).toBeLessThanOrEqual(32);
    expect(peak.provider).toBeLessThanOrEqual(16);
    expect(peak.branchfs).toBeLessThanOrEqual(8);
    expect(peak.browser).toBeLessThanOrEqual(2);
    expect(governor.snapshot()).toMatchObject({
      used: { agent: 0, provider: 0, branchfs: 0, browser: 0 },
      queued: 0,
      metrics: { requested: 1_000, admitted: 1_000, released: 1_000, rejected: 0 }
    });
  });

  test("keeps FIFO ordering, bounded queues, and cancellation explicit", async () => {
    const governor = createCapacityGovernor({ capacities: { browser: 1 }, maxQueued: 2 });
    const lease = await governor.acquire({ resources: { browser: 1 } });
    const order: number[] = [];
    const first = governor.run({ resources: { browser: 1 } }, () => { order.push(1); });
    const abort = new AbortController();
    const cancelled = governor.acquire({ resources: { browser: 1 }, signal: abort.signal });
    abort.abort(new Error("cancelled"));
    await expect(cancelled).rejects.toThrow("cancelled");
    const second = governor.run({ resources: { browser: 1 } }, () => { order.push(2); });
    await expect(governor.acquire({ resources: { browser: 1 } })).rejects.toThrow("queue limit");
    lease.release();
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(governor.snapshot().metrics).toMatchObject({ cancelled: 1, rejected: 1 });
  });

  test("optionally bypasses a blocked multi-resource head with an aging bound", async () => {
    const governor = createCapacityGovernor({
      capacities: { provider: 1, browser: 1 }, scheduling: "work-conserving", maxBypasses: 1
    });
    const provider = await governor.acquire({ resources: { provider: 1 } });
    const blocked = governor.acquire({ resources: { provider: 1, browser: 1 } });
    const browser = await governor.acquire({ resources: { browser: 1 } });
    expect(governor.snapshot().metrics.bypasses).toBe(1);
    browser.release();
    provider.release();
    (await blocked).release();
  });

  test("enforces portable rate windows without treating wall time as a performance gate", async () => {
    let now = 0;
    const governor = createCapacityGovernor({
      capacities: { provider: 2 },
      rateLimits: { "openai.requests": { capacity: 2, intervalMs: 1_000 } },
      now: () => now
    });

    const first = await governor.acquire({ resources: { provider: 1 }, rateCosts: { "openai.requests": 1 } });
    const second = await governor.acquire({ resources: { provider: 1 }, rateCosts: { "openai.requests": 1 } });
    first.release();
    second.release();
    let admitted = false;
    const pending = governor.acquire({ resources: { provider: 1 }, rateCosts: { "openai.requests": 1 } })
      .then((lease) => { admitted = true; return lease; });
    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(governor.snapshot().rateUsage).toEqual({ "openai.requests": 2 });

    now = 1_000;
    governor.setCapacity("provider", 2);
    const lease = await pending;
    expect(governor.snapshot().rateUsage).toEqual({ "openai.requests": 1 });
    lease.release();
  });

  test("supports cooldown and adaptive capacity changes while draining existing leases", async () => {
    let now = 100;
    const governor = createCapacityGovernor({
      capacities: { provider: 2 },
      rateLimits: { "google.requests": { capacity: 10, intervalMs: 1_000 } },
      now: () => now
    });
    const first = await governor.acquire({ resources: { provider: 1 } });
    const second = await governor.acquire({ resources: { provider: 1 } });
    governor.setCapacity("provider", 1);
    governor.defer("google.requests", 500);
    first.release();
    second.release();

    let admitted = false;
    const pending = governor.acquire({ resources: { provider: 1 }, rateCosts: { "google.requests": 1 } })
      .then((lease) => { admitted = true; return lease; });
    await Promise.resolve();
    expect(admitted).toBe(false);
    expect(governor.snapshot()).toMatchObject({
      capacities: { provider: 1 },
      used: { provider: 0 },
      queued: 1,
      metrics: { capacityChanges: 1, cooldowns: 1 }
    });

    now = 600;
    governor.setCapacity("provider", 1);
    const lease = await pending;
    lease.release();
  });

  test("keyed lease registry bridges external start/end events without duplicate reservations", async () => {
    const governor = createCapacityGovernor({ capacities: { browser: 1 } });
    const registry = createCapacityLeaseRegistry({ governor });
    const abort = new AbortController();
    await registry.acquire({ key: "run:tool-1", resources: { browser: 1 }, signal: abort.signal });
    expect(registry.has("run:tool-1")).toBe(true);
    expect(governor.snapshot().used.browser).toBe(1);
    await expect(registry.acquire({ key: "run:tool-1", resources: { browser: 1 } })).rejects.toThrow("already held");
    abort.abort();
    expect(registry.size).toBe(0);
    expect(governor.snapshot().used.browser).toBe(0);
    expect(registry.release("run:tool-1")).toBe(false);
  });
});
