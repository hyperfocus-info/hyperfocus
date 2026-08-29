import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderCallBenchConfig, runRenderCallBench } from "../../scripts/render-call-bench.ts";

test("map overlays stay inside deterministic render-work budgets", async () => {
  const reportDir = mkdtempSync(join(tmpdir(), "engine-render-performance-"));
  const base = renderCallBenchConfig({
    frames: 90,
    warmup: 10,
    players: 20,
    npcs: 180,
    hazards: 120,
    loots: 90,
    effects: 64,
    out: join(reportDir, "render-performance-test.json")
  });
  try {
    const none = await runRenderCallBench({ ...base, map: "none", out: join(reportDir, "render-performance-none.json") });
    const minimap = await runRenderCallBench({ ...base, map: "minimap", out: join(reportDir, "render-performance-minimap.json") });
    const world = await runRenderCallBench({ ...base, map: "world", out: join(reportDir, "render-performance-world.json") });

    expect(minimap.drawn).toEqual(none.drawn);
    expect(world.drawn).toEqual(none.drawn);
    expect(minimap.canvasOperations.p95).toBeLessThanOrEqual(none.canvasOperations.p95 * 1.5);
    expect(world.canvasOperations.p95).toBeLessThanOrEqual(none.canvasOperations.p95 * 2);
  } finally {
    rmSync(reportDir, { force: true, recursive: true });
  }
}, 30000);
