import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { packageTestPlan } from "./package-test-plan.ts";

test("new packages and external test commands enter the default plan without a runner edit", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "package-test-plan-"));
  try {
    await Bun.write(resolve(root, "packages/first/package.json"), JSON.stringify({ scripts: { test: "bun test" } }));
    const before = await packageTestPlan(root);
    await Bun.write(resolve(root, "packages/held-out/package.json"), "{}");
    await Bun.write(resolve(root, "packages/external/package.json"), JSON.stringify({ scripts: { test: "bun test ../../scripts/external" } }));
    const after = await packageTestPlan(root);
    expect(before[0]!.args).not.toContain("packages/held-out");
    expect(after[0]!.args).toContain("packages/held-out");
    expect(after.find(lane => lane.id === "external")?.args).toEqual(["run", "--cwd", "packages/external", "test"]);
    await Bun.write(resolve(root, "packages/external/package.json"), JSON.stringify({ scripts: { test: "" } }));
    await expect(packageTestPlan(root)).rejects.toThrow("Invalid test command");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real review and performance consumers are selected while UI and Engine keep their boundaries", async () => {
  const root = resolve(import.meta.dir, "../..");
  const lanes = await packageTestPlan(root);
  expect(lanes.find(lane => lane.id === "backend")?.args).toContain("packages/performance");
  expect(lanes.find(lane => lane.id === "artifact-review")?.args).toEqual(["run", "--cwd", "packages/artifact-review", "test"]);
  expect(lanes.flatMap(lane => lane.args)).not.toContain("packages/engine");
  const ui = await packageTestPlan(root, true);
  expect(ui).toEqual([{ id: "ui", browser: true, args: ["test", "--conditions", "browser", "packages/ui"] }]);
  expect(lanes.filter(lane => lane.browser)).toEqual(ui);
});
