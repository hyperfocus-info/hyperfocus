import { expect, test } from "bun:test";
import { createDeploymentControlPlaneHandler, createHttpCapacityActuator, createHttpKeyManager, createHttpPersistenceAdapter, createHttpRegionCoordinator, createHttpSessionReplayStore, createRegionalAutoscaler, validateOnCallRoster } from "./deployment.ts";
import { createPortableMemoryPersistenceAdapter } from "./operations.ts";

function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

test("deployment HTTP adapters authenticate shared replay, persistence, and external key rings", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: any }> = [];
  const remote = new Map<string, unknown>();
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, authorization: new Headers(init?.headers).get("authorization"), body });
    if (url.endsWith("/v1/replay/consume")) return json({ result: "accepted" });
    if (url.endsWith("/v1/persistence/player/save")) { remote.set(body.id, body.value); return json({ ok: true }); }
    if (url.endsWith("/v1/persistence/player/load")) return json({ value: remote.get(body.id) ?? null });
    if (url.endsWith("/v1/keys/load")) return json({
      version: "keys-2", activeSessionKeyId: "s", activeBackupKeyId: "b",
      sessionKeys: [{ id: "s", secretBase64: new Uint8Array(32).fill(1).toBase64(), notBefore: 10, notAfter: 20 }],
      backupKeys: [{ id: "b", secretBase64: new Uint8Array(32).fill(2).toBase64() }],
    });
    return json({ ok: true });
  };
  const options = { endpoint: "https://control.example/", bearerToken: "secret", fetch };
  expect(await createHttpSessionReplayStore(options).consume("n", 2, 1)).toBe("accepted");
  const persistence = createHttpPersistenceAdapter(options);
  await persistence.savePlayer("p", { coins: 3 });
  expect(await persistence.loadPlayer("p")).toEqual({ coins: 3 });
  const keys = await createHttpKeyManager(options).load();
  expect(keys).toMatchObject({ version: "keys-2", activeSessionKeyId: "s", activeBackupKeyId: "b" });
  expect(keys.sessionKeys[0]).toMatchObject({ id: "s", notBefore: 10, notAfter: 20 });
  const invalidBackupKeys = createHttpKeyManager({
    ...options,
    fetch: async () => json({
      version: "bad", activeSessionKeyId: "s", activeBackupKeyId: "b",
      sessionKeys: [{ id: "s", secretBase64: new Uint8Array(32).toBase64() }],
      backupKeys: [{ id: "b", secretBase64: new Uint8Array(31).toBase64() }],
    }),
  });
  await expect(invalidBackupKeys.load()).rejects.toThrow("exactly 32 bytes");
  expect(calls.every((call) => call.authorization === "Bearer secret")).toBe(true);
});

test("regional autoscaling is bounded, cooldown-aware, and actuates changes", async () => {
  let now = 1_000; const actions: number[] = [];
  const scaler = createRegionalAutoscaler({ minInstances: 2, maxInstances: 5, cooldownMs: 100 }, async (decision) => { actions.push(decision.desiredInstances); }, () => now);
  expect((await scaler.evaluate({ region: "us-east", currentInstances: 2, readyInstances: 2, utilization: 0.9, queueDepth: 0 })).desiredInstances).toBe(3);
  now += 50;
  expect((await scaler.evaluate({ region: "us-east", currentInstances: 3, readyInstances: 3, utilization: 0.95, queueDepth: 1000 })).reason).toBe("cooldown");
  now += 100;
  expect((await scaler.evaluate({ region: "us-east", currentInstances: 3, readyInstances: 3, utilization: 0.2, queueDepth: 0 })).desiredInstances).toBe(2);
  expect(actions).toEqual([3, 2]);
});

test("production startup requires two independently pageable active operators", () => {
  const roster = {
    primary: { id: "a", displayName: "A", pagingTarget: "pager:a" }, secondary: { id: "b", displayName: "B", pagingTarget: "pager:b" },
    startsAt: 1_000, endsAt: 2_000, escalationPolicyUrl: "https://ops.example/escalate", runbookUrl: "https://ops.example/runbook",
  };
  expect(validateOnCallRoster(roster, 1_500)).toEqual(roster);
  expect(() => validateOnCallRoster({ ...roster, secondary: { ...roster.secondary, id: "a" } }, 1_500)).toThrow("independently pageable");
  expect(() => validateOnCallRoster(roster, 2_000)).toThrow("No active");
});

test("control-plane handler rejects unauthenticated requests and serves atomic deployment boundaries", async () => {
  const persistence = createPortableMemoryPersistenceAdapter();
  const consumed = new Set<string>();
  const heartbeats: unknown[] = [], capacityDecisions: unknown[] = [];
  const handler = createDeploymentControlPlaneHandler({
    bearerToken: "control-secret",
    replayStore: { async consume(nonce) { if (consumed.has(nonce)) return "replayed"; consumed.add(nonce); return "accepted"; } },
    persistence,
    keys: { async load() { return { version: "1", activeSessionKeyId: "s", activeBackupKeyId: "b", sessionKeys: [{ id: "s", secret: new Uint8Array(32) }], backupKeys: [{ id: "b", secret: new Uint8Array(32) }] }; } },
    regions: { async heartbeat(input) { heartbeats.push(input); }, async acquireLease(input) { return { acquired: true, holder: input.nodeId, expiresAt: 10 }; } },
    async setDesiredCapacity(decision) { capacityDecisions.push(decision); },
  });
  const call = (path: string, body: unknown, authorized = true) => handler(new Request(`https://control.example${path}`, { method: "POST", headers: { ...(authorized ? { authorization: "Bearer control-secret" } : {}), "content-type": "application/json" }, body: JSON.stringify(body) }));
  expect((await call("/v1/replay/consume", { nonce: "n", expiresAt: 2, now: 1 }, false)).status).toBe(401);
  expect(await (await call("/v1/replay/consume", { nonce: "n", expiresAt: 2, now: 1 })).json()).toEqual({ result: "accepted" });
  expect(await (await call("/v1/replay/consume", { nonce: "n", expiresAt: 2, now: 1 })).json()).toEqual({ result: "replayed" });
  await call("/v1/persistence/player/save", { id: "p", value: { coins: 4 } });
  expect(await (await call("/v1/persistence/player/load", { id: "p" })).json()).toEqual({ value: { coins: 4 } });
  const fetch = (input: string | URL | Request, init?: RequestInit) => handler(input instanceof Request ? input : new Request(input, init));
  const remoteOptions = { endpoint: "https://control.example/", bearerToken: "control-secret", fetch };
  const regions = createHttpRegionCoordinator(remoteOptions);
  await regions.heartbeat({ nodeId: "node-1", region: "us-east", endpoint: "https://node.example/", capacity: 100, load: 12, ttlMs: 5_000 });
  expect(await regions.acquireLease({ name: "world-primary", nodeId: "node-1", region: "us-east", ttlMs: 5_000 })).toEqual({ acquired: true, holder: "node-1", expiresAt: 10 });
  const decision = { region: "us-east", currentInstances: 2, readyInstances: 2, utilization: 0.9, queueDepth: 4, desiredInstances: 3, reason: "utilization-high" as const, at: 10 };
  await createHttpCapacityActuator(remoteOptions)(decision);
  expect(heartbeats).toEqual([{ nodeId: "node-1", region: "us-east", endpoint: "https://node.example/", capacity: 100, load: 12, ttlMs: 5_000 }]);
  expect(capacityDecisions).toEqual([decision]);
  expect((await call("/v1/regions/heartbeat", { nodeId: "n", region: "r", endpoint: "http://insecure.example", capacity: 1, load: 0, ttlMs: 5_000 })).status).toBe(400);
});
