import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifyDevError, fingerprintDevError, isErrorLogLine } from "../.agents/skills/dev-server/scripts/process";
import { openDevServerRegistry } from "../.agents/skills/dev-server/scripts/registry";
import { listDevSurfaces, resolveDevSurface } from "../.agents/skills/dev-server/scripts/surfaces";
import { createDevErrorCollector, formatDevErrors } from "../.agents/skills/dev-server/scripts/diagnostics";
import type { DevErrorRow } from "../.agents/skills/dev-server/scripts/registry";
import { waitForDevReadiness } from "../.agents/skills/dev-server/scripts/readiness";
import { claimAvailableDevPort, portReservationConflict } from "../.agents/skills/dev-server/scripts/port-selection";

let temporaryRoot: string | undefined;

test("startup exits interrupt a blocked health probe without waiting for its timeout", async () => {
  const result = waitForDevReadiness({ probe: () => new Promise(() => {}), exited: Promise.resolve(7), timeoutMs: 60_000 });
  expect(await Promise.race([result, Bun.sleep(1000).then(() => "hung")])).toBe("exited");
});

test("readiness distinguishes healthy, timed-out, and failed startup", async () => {
  const alive = new Promise<number>(() => {});
  expect(await waitForDevReadiness({ probe: async () => true, exited: alive, timeoutMs: 1000 })).toBe("healthy");
  expect(await waitForDevReadiness({ probe: async () => false, exited: alive, timeoutMs: 0 })).toBe("timeout");
  await expect(waitForDevReadiness({ probe: async () => false, exited: Promise.reject(new Error("spawn failed")), timeoutMs: 1000 })).rejects.toThrow("spawn failed");
});

afterEach(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = undefined;
});

describe("development server registry", () => {
  test("independent coordinators cannot claim the same starting port and release it on finish", () => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), "hyperfocus-dev-port-"));
    const database = path.join(temporaryRoot, "registry.sqlite");
    const first = openDevServerRegistry(database), second = openDevServerRegistry(database);
    const row = { id: "port-owner", surface: "books", worktreePath: "C:/fixture", branch: "main",
      mode: "isolated" as const, host: "127.0.0.1", port: 45_000, url: "http://127.0.0.1:45000",
      startedAt: "2026-10-26T00:00:00Z", heartbeatAt: "2026-10-26T00:00:00Z", logPath: "fixture.log", commandJson: "[]" };
    try {
      first.createServer(row);
      expect(() => second.createServer({ ...row, id: "port-competitor" })).toThrow(/reserved/i);
      expect(second.getServer("port-competitor")).toBeUndefined();
      first.finish(row.id, "stopped", "2026-10-26T00:00:01Z");
      first.markRunning(row.id, "2026-10-26T00:00:02Z");
      expect(first.getServer(row.id)?.status).toBe("stopped");
      second.createServer({ ...row, id: "port-competitor" });
      expect(second.getServer("port-competitor")?.status).toBe("starting");
    } finally { first.close(); second.close(); }
  });

  test("sidecar ports are reserved atomically and failed claims leave no partial owner", () => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), "hyperfocus-dev-sidecar-"));
    const registry = openDevServerRegistry(path.join(temporaryRoot, "registry.sqlite"));
    const row = { id: "sidecar-owner", surface: "harness", worktreePath: "C:/fixture", branch: "main",
      mode: "isolated" as const, host: "127.0.0.1", port: 45_100, url: "http://127.0.0.1:45100",
      startedAt: "2026-10-26T00:00:00Z", heartbeatAt: "2026-10-26T00:00:00Z", logPath: "fixture.log", commandJson: "[]" };
    try {
      registry.createServer(row, [45_100, 45_101]);
      const blocked = { ...row, id: "blocked", port: 45_099 };
      expect(() => registry.createServer(blocked, [45_099, 45_100])).toThrow(/reserved/i);
      expect(registry.getServer("blocked")).toBeUndefined();
      registry.createServer({ ...blocked, id: "free-neighbor" });
      registry.finish(row.id, "failed", "2026-10-26T00:00:01Z");
      registry.createServer({ ...row, id: "released-sidecar", port: 45_101 });
      expect(registry.getServer("released-sidecar")?.status).toBe("starting");
    } finally { registry.close(); }
  });

  test("tracks reusable processes and reopens recurring fixed errors", () => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), "hyperfocus-dev-registry-"));
    const registry = openDevServerRegistry(path.join(temporaryRoot, "registry.sqlite"));
    const startedAt = "2026-09-05T12:00:00.000Z";
    registry.createServer({ id: "server-1", surface: "editor", worktreePath: "C:/repo", branch: "main",
      mode: "shared", host: "127.0.0.1", port: 8796, url: "http://127.0.0.1:8796", startedAt,
      heartbeatAt: startedAt, logPath: "C:/logs/editor.log", commandJson: "[]" });
    registry.setSupervisorPid("server-1", 42);
    registry.setChildPid("server-1", 43);
    registry.markRunning("server-1", startedAt);
    expect(registry.findReusable("editor", "C:/repo")).toMatchObject({ port: 8796, status: "running" });

    registry.recordError({ serverId: "server-1", category: "build", source: "stderr",
      fingerprint: "same", message: "Build failed", at: startedAt });
    registry.recordError({ serverId: "server-1", category: "build", source: "stderr",
      fingerprint: "same", message: "Build failed again", at: "2026-09-05T12:01:00.000Z" });
    const error = registry.listErrors()[0];
    if (!error) throw new Error("Expected the registry error row");
    expect(error).toMatchObject({ occurrenceCount: 2, message: "Build failed again", fixedAt: null });
    registry.setErrorState(error.id, "fixed", "2026-09-05T12:02:00.000Z");
    expect(registry.listErrors()).toEqual([]);
    registry.recordError({ serverId: "server-1", category: "build", source: "stderr",
      fingerprint: "same", message: "Build regressed", at: "2026-09-05T12:03:00.000Z" });
    expect(registry.listErrors()[0]).toMatchObject({ occurrenceCount: 3, fixedAt: null });
    registry.close();
  });
});

test("port selection retries a lost registry claim, including negative sidecar offsets", async () => {
  const attempts: number[] = [];
  const selected = await claimAvailableDevPort({ startPort: 45_500, offsets: [-1, 0, 1], claim(port, ports) {
    attempts.push(port);
    expect(ports).toEqual([port - 1, port, port + 1]);
    if (attempts.length === 1) throw portReservationConflict("127.0.0.1", port);
    return port;
  } });
  expect(attempts.length).toBe(2);
  expect(selected).toBeGreaterThan(attempts[0]!);
  await expect(claimAvailableDevPort({ startPort: 1, offsets: [-1, 0], claim: () => 0 })).rejects.toThrow(RangeError);
});

describe("development error classification", () => {
  test("categorizes common failures and stabilizes fingerprints", () => {
    expect(classifyDevError("SQLite database is locked")).toBe("persistence");
    expect(classifyDevError("EADDRINUSE port 8787")).toBe("network");
    expect(classifyDevError("Build failed: Cannot find module x")).toBe("build");
    expect(classifyDevError("Unhandled exception")).toBe("runtime");
    expect(classifyDevError("panic: range end index out of range")).toBe("runtime");
    expect(classifyDevError("EPERM: operation not permitted, rename")).toBe("process");
    expect(isErrorLogLine("ordinary request", "stdout")).toBe(false);
    expect(isErrorLogLine("warning from tool", "stderr")).toBe(false);
    expect(isErrorLogLine("$ bun run ./scripts/build-ui.ts", "stderr")).toBe(false);
    expect(isErrorLogLine("TypeError: failed to load", "stderr")).toBe(true);
    expect(fingerprintDevError("Error at C:\\repo\\file.ts:1234"))
      .toBe(fingerprintDevError("Error at C:\\other\\file.ts:5678"));
  });
});

describe("development surfaces", () => {
  test("maps product aliases onto canonical reusable and artifact servers", () => {
    expect(listDevSurfaces().map((surface) => surface.name).sort()).toEqual(["album-library", "artifact-review", "books", "combat-relay", "editor", "example-workspace", "game-art", "harness", "pad-pilot", "pale-reach", "pale-reach-review", "site-preview", "synaesthetic", "touch-of-death-audio", "touch-of-death-lab", "touch-of-death-runs", "trade-bot"]);
    expect(resolveDevSurface('trade-bot')?.defaultPort).toBe(8813);
    expect(resolveDevSurface('trade-bot')?.environment(8813)).toEqual({ PORT: '8813', HOST: '127.0.0.1', NODE_ENV: 'development', TRADE_PUBLIC_ORIGIN: 'http://127.0.0.1:8813', TRADE_OIDC_CLIENT_ID: '', TRADE_OIDC_CLIENT_SECRET: '' });
    expect(resolveDevSurface("combat-relay")?.environment(8801)).toEqual({
      PORT: "8801", HOST: "127.0.0.1", DATABASE_URL: "",
      TOUCH_OF_DEATH_REQUIRE_POSTGRES: "0", TOUCH_OF_DEATH_STORAGE: "sqlite",
    });
    expect(resolveDevSurface("site-builder")).toBeUndefined();
    expect(resolveDevSurface("site-preview")?.environment(8899)).toEqual({PORT:"8899",HOST:"127.0.0.1"});
    expect(resolveDevSurface("engine-editor")?.name).toBe("editor");
    expect(resolveDevSurface("pad-pilot-marketplace")?.name).toBe("pad-pilot");
    expect(resolveDevSurface("missing")).toBeUndefined();
  });
});

describe("development diagnostic output", () => {
  test("stores a Bun failure with its excerpt and stack, without stack-only errors", () => {
    const errors: { message: string; category: string }[] = [];
    const collector = createDevErrorCollector({ record: (error) => errors.push(error) });
    for (const message of ["$ bun run build:ui", "358 | const backup = path.join(parent, suffix);",
      "359 | await rename(stagedInput, staged);", "                  ^",
      "EPERM: operation not permitted, rename 'input' -> 'stage'", "  path: 'input',",
      "  code: 'EPERM'", "      at async buildUi (build-ui.ts:111:9)", "Bun v1.4.0 (Windows x64)"]) {
      collector.push({ source: "stderr", message, at: "2026-09-06T00:00:00Z" });
    }
    collector.flush();
    collector.flush();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("359 | await rename");
    expect(errors[0]?.message).toContain("at async buildUi");
    expect(errors[0]?.message).toContain("EPERM");
    expect(errors[0]?.category).toBe("process");
  });

  test("retains distinct and unknown failures, separates streams, and flushes on a quiet period", async () => {
    const errors: { message: string }[] = [];
    const collector = createDevErrorCollector({ record: (error) => errors.push(error), quietMs: 1 });
    const push = (source: string, message: string) => collector.push({ source, message, at: "now" });
    push("stderr", "TypeError: first failure");
    push("stdout", "Listening on port 3000");
    push("stderr", "    at first (a.ts:1:2)");
    push("stderr", "Error: second failure");
    push("stderr", "    at second (b.ts:2:3)");
    await Bun.sleep(10);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain("at first");
    expect(errors[1]?.message).toContain("at second");
    push("stderr", "unrecognized tool diagnostic");
    collector.flush();
    expect(errors).toHaveLength(3);
    push("stderr", "warning: optional helper unavailable");
    collector.flush();
    expect(errors).toHaveLength(3);
  });

  test("bounds stack storage and default output while preserving explicit full access", () => {
    const records: { message: string }[] = [];
    const collector = createDevErrorCollector({ record: (error) => records.push(error) });
    collector.push({ source: "stderr", message: `Build failed ${"x".repeat(12_000)}`, at: "now" });
    collector.push({ source: "stderr", message: "    at build", at: "now" });
    collector.flush();
    expect(records[0]?.message.length).toBeLessThanOrEqual(8_000);
    expect(records[0]?.message).toContain("see full dev log");
    collector.push({ source: "stderr", message: `100 | ${"x".repeat(12_000)}`, at: "now" });
    collector.push({ source: "stderr", message: "Error: actual failure after a huge source excerpt", at: "now" });
    collector.flush();
    expect(records[1]?.message).toStartWith("Error: actual failure");
    expect(records[1]?.message.length).toBeLessThanOrEqual(8_000);
    const errors: DevErrorRow[] = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1, serverId: "one", surface: "editor", category: "build", source: "stderr",
      message: `10 | some code\nBuild failed: ${"a".repeat(500)}\n    at build`, occurrenceCount: 1,
      firstSeenAt: "now", lastSeenAt: "now", investigatedAt: null, fixedAt: null
    }));
    const compact = formatDevErrors({ errors });
    expect(compact).toContain("Showing 20 of 100");
    expect(compact).not.toContain("some code");
    expect(compact.length).toBeLessThan(6_500);
    const full = formatDevErrors({ errors, limit: 100, full: true });
    expect(full).toContain("Showing 100 of 100");
    expect(full).toContain("some code");
    const legacy = [{ ...errors[0]!, message: "    at build (a.ts:1:2)" }, errors[1]!];
    expect(formatDevErrors({ errors: legacy })).toContain("1 historical context-only records omitted");
    expect(formatDevErrors({ errors: legacy })).not.toContain("a.ts:1:2");
    expect(formatDevErrors({ errors: legacy, full: true })).toContain("a.ts:1:2");
  });
});
