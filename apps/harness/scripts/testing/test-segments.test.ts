import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildDefaultTestSegments } from "./test-segments";

const repoRoot = path.resolve(import.meta.dir, "../../../..");

describe("default harness test segments", () => {
  test("runs process, Git, server, and UI-build integrations serially", () => {
    const segments = buildDefaultTestSegments(repoRoot);
    const integration = segments.find((segment) => segment.name === "integration");

    expect(integration?.serial).toBe(true);
    expect(integration?.isolateTargets).toBe(true);
    expect(integration?.env?.HARNESS_TEST_SKIP_UI_PRELOAD).toBe("1");
    expect(integration?.browser).not.toBe(true);
    expect(segments.find(segment => segment.name === "ui")?.browser).toBe(true);
    expect(integration?.targets).toContain("./apps/harness/cli/src/git-preflight.test.ts");
    expect(integration?.targets).toContain("./apps/harness/cli/src/server-tests/runtime-budget.test.ts");
    expect(integration?.targets).toContain("./apps/harness/cli/src/terminal/terminal-ws-mock-client.test.ts");
    expect(integration?.targets).toContain("./apps/harness/cli/src/ui-build.test.ts");
    expect(integration?.targets).toContain("./apps/harness/cli/src/swarm/execution/integration.test.ts");
    expect(integration?.targets).toContain("./apps/harness/cli/src/swarm/execution/runner.test.ts");
    expect(segments.every((segment) => segment.targets.every((target) => target.startsWith("./")))).toBe(true);
  });

  test("assigns every CLI test exactly once", () => {
    const segments = buildDefaultTestSegments(repoRoot);
    const cliTargets = segments.flatMap((segment) => segment.targets).filter((target) => target.endsWith(".test.ts"));

    expect(new Set(cliTargets).size).toBe(cliTargets.length);
  });

  test("isolates foreign renderer mocks from ordinary UI consumers", () => {
    const segments = buildDefaultTestSegments(repoRoot);
    const ui = segments.find(segment => segment.name === "ui");
    const foreign = segments.find(segment => segment.name === "ui-foreign-adapters");
    const renderer = "./apps/harness/ui/src/terminal/renderers/xterm-renderer.test.tsx";
    expect(foreign?.targets).toEqual([renderer]);
    expect(foreign?.browser).toBe(true);
    expect(foreign?.serial).toBe(true);
    expect(foreign?.isolateTargets).toBe(true);
    expect(ui?.targets).not.toContain(renderer);
    expect(ui?.targets).toContain("./apps/harness/ui/src/terminal/terminal-drawer.test.tsx");
    expect(ui?.targets.every(target => /\.test\.tsx?$/.test(target))).toBe(true);
  });
});
