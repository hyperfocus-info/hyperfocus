import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildDefaultTestSegments } from "./test-segments";

const repoRoot = path.resolve(import.meta.dir, "../../..");

describe("default harness test segments", () => {
  test("runs process, Git, server, and UI-build integrations serially", () => {
    const segments = buildDefaultTestSegments(repoRoot);
    const integration = segments.find((segment) => segment.name === "integration");

    expect(integration?.serial).toBe(true);
    expect(integration?.isolateTargets).toBe(true);
    expect(integration?.env?.HARNESS_TEST_SKIP_UI_PRELOAD).toBe("1");
    expect(integration?.targets).toContain("apps/harness/cli/src/git-preflight.test.ts");
    expect(integration?.targets).toContain("apps/harness/cli/src/server-tests/runtime-budget.test.ts");
    expect(integration?.targets).toContain("apps/harness/cli/src/terminal/terminal-ws-mock-client.test.ts");
    expect(integration?.targets).toContain("apps/harness/cli/src/ui-build.test.ts");
  });

  test("assigns every CLI test exactly once", () => {
    const segments = buildDefaultTestSegments(repoRoot);
    const cliTargets = segments.flatMap((segment) => segment.targets).filter((target) => target.endsWith(".test.ts"));

    expect(new Set(cliTargets).size).toBe(cliTargets.length);
  });
});
