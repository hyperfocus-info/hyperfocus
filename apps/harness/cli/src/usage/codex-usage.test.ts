import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createWorkspaceRepository } from "../workspace-repository";
import { createEmptyTokenUsageTotals } from "./token-usage";
import { recordServerTokenUsage } from "../server/transport/events";
import { probeCodexLimits, refreshCodexLimits } from "./codex-limits";
import { handleUsageCommand } from "../server/commands/usage";
import { clientCommandSchema } from "@hyperfocus/ai-core/protocol";
import { resolveHarnessTestTempRoot } from "../test-support/test-temp-root";

function fixture() {
  const directory = resolveHarnessTestTempRoot(); mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "codex-usage-" + crypto.randomUUID() + ".sqlite");
  return { file, repository: createWorkspaceRepository(file, process.cwd(), { durability: "test-fast" }) };
}
test("failed persistence rolls back totals and leaves session untouched", () => {
  const { repository, file } = fixture();
  const session = createEmptyTokenUsageTotals();
  const db = new Database(file);
  db.exec(`CREATE TRIGGER reject_usage BEFORE INSERT ON workspace_meta WHEN NEW.key = 'token_usage_observations_v1' BEGIN SELECT RAISE(ABORT, 'fixture failure'); END`);
  try {
    expect(() => recordServerTokenUsage(repository, session, usage)).toThrow("fixture failure");
    expect(session.totalProcessedTokens).toBe(0);
    expect(repository.getTokenUsageLifetime().totalProcessedTokens).toBe(0);
    expect(repository.getTokenUsageState(session).sources).toEqual([]);
  } finally { db.close(); repository.close(); }
});

const usage = { sourceKind: "main" as const, sourceLabel: "main", modelId: "openai/gpt-5.4", inputTokens: 1200,
  cachedInputTokens: 1000, totalProcessedTokens: 1280, contextWindow: 400000, updatedAt: "2026-11-15T12:00:00.000Z" };
test("observed attribution survives reopen, repeated events and reset without touching quota", async () => {
  let { file, repository } = fixture();
  const session = createEmptyTokenUsageTotals();
  const attribution = { projectId: "project-fixture", threadId: "thread-fixture", runId: "run-fixture", runtime: "codex" };
  recordServerTokenUsage(repository, session, usage, attribution);
  recordServerTokenUsage(repository, session, usage, attribution);
  expect(session.totalProcessedTokens).toBe(1280);
  repository.close();
  repository = createWorkspaceRepository(file, process.cwd(), { durability: "test-fast" });
  try {
    expect(repository.getTokenUsageState(session).sources?.[0]).toMatchObject({ projectId: attribution.projectId, threadId: attribution.threadId, runtime: attribution.runtime, totals: { inputTokens: 1200, cachedInputTokens: 1000, outputTokens: 80 } });
    recordServerTokenUsage(repository, session, usage, attribution);
    expect(repository.getTokenUsageLifetime().totalProcessedTokens).toBe(1280);
    const limits = { status: "available" as const, windows: [{ id: "secondary" as const, usedPercent: 12, remainingPercent: 88, windowDurationMins: 10080, resetsAt: "2026-11-20T12:00:00.000Z" }] };
    repository.setCodexLimits(limits);
    repository.resetTokenUsageLifetime("2026-11-15T13:00:00.000Z");
    recordServerTokenUsage(repository, createEmptyTokenUsageTotals(), usage, attribution);
    expect(repository.getTokenUsageState(session)).toMatchObject({ lifetime: { totalProcessedTokens: 0 }, sources: [], codexLimits: limits });
    recordServerTokenUsage(repository, session, { ...usage, updatedAt: "2026-11-15T14:00:00.000Z" }, { ...attribution, threadId: "another-thread" });
    expect(repository.getTokenUsageLifetime().totalProcessedTokens).toBe(1280);
    // Context occupancy alone is never billed usage.
    recordServerTokenUsage(repository, session, { ...usage, inputTokens: undefined, totalProcessedTokens: undefined, tokens: 4000 }, attribution);
    expect(repository.getTokenUsageLifetime().totalProcessedTokens).toBe(1280);
  } finally { repository.close(); }
});

test("official probe maps weekly reset and exhausted quota independently of swarm availability", async () => {
  const read: NonNullable<Parameters<typeof probeCodexLimits>[0]>["read"] = async () => ({ authenticated: true, available: false,
    plan: "plus", checkedAt: Date.parse("2026-11-15T12:00:00.000Z"), separatelyBilledUsd: 0,
    limits: { primary: { usedPercent: 100, resetsAt: 1800000000 }, secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1800000000 } } });
  const result = await probeCodexLimits({ executable: "fixture", read });
  expect(result.status).toBe("available");
  expect((await probeCodexLimits({ executable: "fixture", read: async options => ({ ...(await read!(options)), limits: { primary: null, secondary: null } }) })).status).toBe("unavailable");
  expect((await probeCodexLimits({ executable: "fixture", read: async options => ({ ...(await read!(options)), limits: { primary: { usedPercent: Number.NaN }, secondary: null } }) })).status).toBe("error");
  expect(result.windows[1]).toMatchObject({ remainingPercent: 88, windowDurationMins: 10080, resetsAt: new Date(1800000000000).toISOString() });
  expect((await probeCodexLimits({ executable: "fixture", read: async () => { throw Error("secret-token"); } }))).toMatchObject({ status: "error", windows: [] });
  expect(JSON.stringify(await probeCodexLimits({ executable: "fixture", read: async () => { throw Error("secret-token"); } }))).not.toContain("secret-token");
  expect((await probeCodexLimits({ executable: "fixture", read: async () => ({ authenticated: false, available: false, plan: null, checkedAt: Date.now(), separatelyBilledUsd: 0 }) })).status).toBe("unavailable");
});

test("refresh coalesces and reset command broadcasts authoritative local-only state to two clients", async () => {
  const { repository } = fixture();
  const session = createEmptyTokenUsageTotals();
  const received: unknown[][] = [[], []];
  const sockets = received.map(events => ({ data: { clientId: "fixture", clientKind: "native" as const, kind: "control" as const, encoding: "json" as const }, readyState: 1,
    getBufferedAmount: () => 0, send: (value: string) => { events.push(JSON.parse(value)); return value.length; }, close() {} }));
  let calls = 0;
  try {
    await Promise.all([refreshCodexLimits(repository, async () => { calls++; await Promise.resolve(); return { status: "available", windows: [{ id: "primary", usedPercent: 12, remainingPercent: 88 }] }; }),
      refreshCodexLimits(repository, async () => { throw Error("must coalesce"); })]);
    expect(calls).toBe(1);
    recordServerTokenUsage(repository, session, usage);
    const context = { repository, tokenUsageSession: session, connections: new Set(sockets), ws: sockets[0] };
    await handleUsageCommand(clientCommandSchema.parse({ type: "usage.reset", requestId: "reset-fixture" }), context);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(session.totalProcessedTokens).toBe(0);
    expect(repository.getTokenUsageState(session).codexLimits?.windows[0]?.remainingPercent).toBe(88);
    expect(received[0]).toEqual(received[1]);
    expect(received[0]?.length).toBeGreaterThan(0);
    await handleUsageCommand(clientCommandSchema.parse({ type: "usage.refresh", requestId: "refresh-fixture" }), {
      ...context, codexUsageProbe: () => probeCodexLimits({ executable: "fixture", read: async () => { throw Error("secret"); } })
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(repository.getTokenUsageState(session).codexLimits).toMatchObject({ status: "error", windows: [] });
    expect(received[0]).toEqual(received[1]);
    expect(JSON.stringify(received[0])).toContain('"status":"error"');
    expect(JSON.stringify(received[0])).not.toContain("secret");
  } finally { repository.close(); }
});

 test("account probe uses the bundled Harness runtime without a global CLI", async () => {
  const { getBundledCodexInstallation } = await import("../agent-runtimes/codex-installation");
  const installation = getBundledCodexInstallation();
  if (!installation.installed) return;
  let executable: string | undefined;
  await probeCodexLimits({ read: async options => {
    executable = options.executable;
    return { authenticated: false, available: false, plan: null, checkedAt: Date.now(), separatelyBilledUsd: 0 };
  } });
  expect(executable).toBe(installation.executablePath);
});
