import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { parseServerEventFrame, tokenUsageStateSchema, type UsageSource } from "@hyperfocus/ai-core/protocol";
import { readValueFrame } from "@hyperfocus/serialization";
import { createWorkspaceRepository } from "../workspace-repository";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";
import { createFakePiAgentAdapter } from "../test-support/fake-pi-agent-adapter";
import { createSocket, startServerForTest, stopServerForTest } from "../server-tests/support/server-test-client";
import { createWebsocketEventBatcher } from "../websocket-event-batcher";
import { createEmptyTokenUsageTotals } from "./token-usage";
import { migrateUsageLedger } from "./usage-ledger";

test("usage migration failure retains the legacy blob and retries atomically", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE workspace_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.query("INSERT INTO workspace_meta VALUES ('token_usage_observations_v1', ?)").run('{"sources":[{}],"observations":{"old":true}}');
  try {
    expect(() => migrateUsageLedger(db)).toThrow();
    expect(db.query("SELECT value FROM workspace_meta WHERE key = 'token_usage_observations_v1'").get()).not.toBeNull();
    expect(db.query("SELECT name FROM sqlite_master WHERE name = 'usage_receipts'").get()).toBeNull();
    db.query("UPDATE workspace_meta SET value = ?").run('{"sources":[],"observations":{"old":true}}');
    migrateUsageLedger(db); migrateUsageLedger(db);
    expect(db.query("SELECT id FROM usage_receipts").all()).toEqual([{ id: "old" }]);
  } finally { db.close(); }
});

function waitForEvent(socket: WebSocket, type: "connection.ready" | "usage.updated") {
  return new Promise<{ payload: { tokenUsage: ReturnType<typeof tokenUsageStateSchema.parse> } }>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); socket.removeEventListener("message", receive); };
    const timer = setTimeout(() => { cleanup(); reject(Error(`Timed out waiting for ${type}`)); }, 15000);
    const receive = (message: MessageEvent) => {
      try {
        for (const event of parseServerEventFrame(readValueFrame(message.data))) {
          if (event.type === type) { cleanup(); resolve(event); return; }
        }
      } catch (error) { cleanup(); reject(error); }
    };
    socket.addEventListener("message", receive);
  });
}

test("legacy history above the control budget migrates, reconnects and retains indexed replay receipts across reset/reopen", async () => {
  const directory = resolveHarnessTestTempRoot(); mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `usage-growth-${crypto.randomUUID()}.sqlite`);
  let repository = createWorkspaceRepository(file, process.cwd(), { durability: "test-fast" });
  repository.close();
  const delta = createEmptyTokenUsageTotals({ inputTokens: 12, outputTokens: 8, cachedInputTokens: 5, totalProcessedTokens: 20, totalTokensIncludingCached: 20, events: 1 });
  const sources: UsageSource[] = Array.from({ length: 100_000 }, (_, index) => ({ projectId: `project-${index}`, threadId: `thread-${index}`, sourceKind: "main", sourceLabel: "Main implementation", modelId: "openai/gpt-6.1-sol", runtime: "codex", totals: delta }));
  const lifetime = createEmptyTokenUsageTotals({ inputTokens: 1200000, outputTokens: 800000, cachedInputTokens: 500000, totalProcessedTokens: 2000040, totalTokensIncludingCached: 2000040, events: 100002 });
  const original = { sources, session: createEmptyTokenUsageTotals(), lifetime };
  expect(Buffer.byteLength(JSON.stringify(original))).toBeGreaterThan(25_165_824);
  expect(tokenUsageStateSchema.safeParse(original).success).toBe(true);
  const batcher = createWebsocketEventBatcher({ maxQueuedBytes: 1048576, maxEventBytes: 25_165_824 });
  expect(() => batcher.send({ send() { return 1; }, close() {} }, { type: "usage.updated", requestId: "oversized", payload: { tokenUsage: original } })).toThrow("byte limit");
  const db = new Database(file);
  db.transaction(() => {
    db.exec("DROP TABLE usage_sources; DROP TABLE usage_receipts; DELETE FROM repository_migrations WHERE id = 'usage-ledger-v2'; DELETE FROM workspace_meta WHERE key = 'token_usage_attributed_v2'");
    db.query("INSERT INTO workspace_meta(key,value) VALUES ('token_usage_observations_v1', ?)").run(JSON.stringify({ sources, observations: Object.fromEntries(sources.map((_, i) => [`receipt-${i}`, true])) }));
    db.query("INSERT OR REPLACE INTO workspace_meta(key,value) VALUES ('token_usage_lifetime_v1', ?)").run(JSON.stringify(lifetime));
  })();
  db.close();
  repository = createWorkspaceRepository(file, process.cwd(), { durability: "test-fast" });
  let server: Awaited<ReturnType<typeof startServerForTest>>["server"] | undefined;
  const sockets: WebSocket[] = [];
  try {
    const state = repository.getTokenUsageState(createEmptyTokenUsageTotals());
    expect(state.sources).toHaveLength(100);
    expect(state.sourceOverflow).toMatchObject({ count: 99900, totals: { inputTokens: 1198800, outputTokens: 799200, cachedInputTokens: 499500, totalProcessedTokens: 1998000 } });
    expect(state.lifetime.totalProcessedTokens).toBe(2000040); // 40 tokens of legacy unknown history.
    for (const encoding of ["json", "protobuf"] as const) {
      const sent: Array<string | Uint8Array> = [];
      const socket = { send(value: string | Uint8Array) { sent.push(value); return 1; }, close() {} };
      batcher.send(socket, { type: "usage.updated", requestId: "growth-update", payload: { tokenUsage: state } }, encoding);
      batcher.flush(socket);
      const update = parseServerEventFrame(readValueFrame(sent[0]!))[0]!;
      expect(update.type).toBe("usage.updated");
      if (update.type === "usage.updated") expect(update.payload.tokenUsage).toEqual(state);
    }
    const inspected = new Database(file);
    expect(inspected.query("SELECT value FROM workspace_meta WHERE key = 'token_usage_observations_v1'").get()).toBeNull();
    expect(inspected.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM usage_receipts").get()?.count).toBe(100000);
    inspected.close();
    const started = await startServerForTest({ port: 0, repository, adapter: createFakePiAgentAdapter(), serverOnly: true }); server = started.server;
    for (let i = 0; i < 2; i++) {
      const socket = createSocket(started.port); sockets.push(socket);
      const ready = await waitForEvent(socket, "connection.ready");
      expect(ready.payload.tokenUsage).toEqual(state);
    }
    const updates = sockets.map(socket => waitForEvent(socket, "usage.updated"));
    sockets[0]!.send(JSON.stringify({ type: "usage.reset", requestId: "growth-reset" }));
    const reset = await Promise.all(updates);
    expect(reset[0].payload.tokenUsage).toEqual(reset[1].payload.tokenUsage);
    expect(reset[0].payload.tokenUsage.sourceOverflow?.count).toBe(0);
    expect(reset[0].payload.tokenUsage.lifetime.totalProcessedTokens).toBe(0);
    for (const socket of sockets) socket.close();
    await stopServerForTest(server); server = undefined;
    repository.close();
    repository = createWorkspaceRepository(file, process.cwd(), { durability: "test-fast" });
    const { totals: _, ...source } = sources[0]!;
    expect(repository.recordTokenUsage(delta, source, "receipt-0").events).toBe(0);
    expect(repository.recordTokenUsage(delta, source, "new-receipt").events).toBe(1);
    expect(repository.getTokenUsageLifetime().totalProcessedTokens).toBe(20);
    // An individually oversized legacy identity is aggregated honestly and never sent.
    repository.recordTokenUsage(delta, { ...source, threadId: "x".repeat(26_000_000) }, "large-identity");
    const bounded = repository.getTokenUsageState(createEmptyTokenUsageTotals());
    expect(bounded.sourceOverflow).toMatchObject({ count: 1, totals: { totalProcessedTokens: 20 } });
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThan(819200);
    expect(bounded.sources![0]!.totals.totalProcessedTokens + bounded.sourceOverflow!.totals.totalProcessedTokens).toBe(bounded.lifetime.totalProcessedTokens);
    const ledger = new Database(file);
    try {
      expect(ledger.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM usage_receipts").get()?.count).toBe(100002);
      const plan = ledger.query<{ detail: string }, []>("EXPLAIN QUERY PLAN SELECT payload FROM usage_sources WHERE wire_eligible = 1 ORDER BY rowid LIMIT 100").all();
      expect(plan.map(row => row.detail).join(" ")).toContain("usage_sources_wire_idx");
      expect(plan.map(row => row.detail).join(" ")).not.toContain("TEMP B-TREE");
    } finally { ledger.close(); }
    const restarted = await startServerForTest({ port: 0, repository, adapter: createFakePiAgentAdapter(), serverOnly: true }); server = restarted.server;
    const reconnect = createSocket(restarted.port); sockets.push(reconnect);
    expect((await waitForEvent(reconnect, "connection.ready")).payload.tokenUsage).toEqual(bounded);
  } finally {
    for (const socket of sockets) socket.close();
    await stopServerForTest(server); repository.close();
  }
}, 60000);
