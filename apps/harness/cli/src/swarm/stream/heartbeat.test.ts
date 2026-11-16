import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { createSwarmRequestSchema } from "@hyperfocus/ai-core/swarm";
import { createSwarmHttpFixture } from "../test-fixture";
import { createSwarmHttpHandler } from "../http";

test("real HTTP heartbeats retain an idle READY stream until external launch and stop on shutdown", async () => {
  const owner = resolve(import.meta.dir, "../../../../.local/swarm-heartbeat-tests"); await mkdir(owner, { recursive: true });
  const directory = await mkdtemp(join(owner, "run-"));
  const fixture = createSwarmHttpFixture({ directory });
  const shutdown = new AbortController();
  const handler = createSwarmHttpHandler({ ...fixture, backend: "local", shutdownSignal: shutdown.signal, eventHeartbeatMs: 1_000 });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 10, fetch: handler });
  try {
    const run = fixture.coordinator.create(createSwarmRequestSchema.parse({ requestId: crypto.randomUUID(), projectId: "fixture-project", goal: "SIMULATED TEST WORKLOAD [cancel]", backend: "local", repository: { revision: "a".repeat(40) }, reviewPlan: true }));
    const response = await fetch(new URL(`/api/swarm/v1/runs/${run.id}/events`, server.url), { headers: { authorization: `Bearer ${fixture.token}`, "accept-encoding": "gzip" }, signal: AbortSignal.timeout(8_000) });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    const reader = response.body?.getReader(); if (!reader) throw Error("SSE body missing.");
    const decode = async () => new TextDecoder().decode((await reader.read()).value);
    const initial = await decode(); expect(initial).toContain('"status":"READY"'); expect(initial).toContain("id: 0\n");
    expect(await decode()).toBe(": heartbeat\n\n");
    expect(await decode()).toBe(": heartbeat\n\n");
    expect(fixture.store.get(run.id)?.updatedAt).toBe(run.updatedAt);
    fixture.coordinator.start(run.id);
    const changed = await decode(); expect(changed).toContain('"status":"RUNNING"'); expect(changed).toContain("id: 1\n");
    shutdown.abort();
    expect((await reader.read()).done).toBe(true);
    fixture.coordinator.cancel(run.id);
  } finally {
    shutdown.abort(); await server.stop(true); await fixture.close();
    if (!resolve(directory).startsWith(owner + sep)) throw Error("Fixture cleanup escaped its owned directory.");
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);
