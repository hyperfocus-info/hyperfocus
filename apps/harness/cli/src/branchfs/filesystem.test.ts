import { describe, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import * as fs from "node:fs/promises";
import path from "node:path";
import { createBranchfsManager } from "../branchfs-manager";
import { pruneBranchfsRoots } from "../branchfs-cleanup";
import { useGitProjectFixture } from "../test-support/git-project-fixture";
import { copyBranchfsPathRobust, readFileIfPresent, statIfPresent } from "./filesystem";

describe("BranchFS filesystem failures", () => {
  const fixture = useGitProjectFixture({ fixtureName: "branchfs-filesystem", packageName: "branchfs-filesystem-test", readmeTitle: "BranchFS fixture\n" });

  test("only missing paths become absent data", async () => {
    const root = await fixture.createRepoClone("missing");
    expect(await statIfPresent(path.join(root, "absent"))).toBeUndefined();
    expect(await readFileIfPresent(path.join(root, "absent"))).toBeUndefined();
    await expect(statIfPresent("\0")).rejects.toThrow();
    await expect(readFileIfPresent("\0")).rejects.toThrow();
  });

  test("a denied source inspection preserves the destination", async () => {
    const root = await fixture.createRepoClone("denied-copy");
    const source = path.join(root, "source.txt"), target = path.join(root, "target.txt");
    await fs.writeFile(source, "incoming"); await fs.writeFile(target, "keep");
    const denied = Object.assign(new Error("source inspection denied"), { code: "EACCES" });
    const inspect = spyOn(fs, "lstat").mockRejectedValue(denied);
    try {
      await expect(copyBranchfsPathRobust(source, target)).rejects.toBe(denied);
      expect(await fs.readFile(target, "utf8")).toBe("keep");
    } finally { inspect.mockRestore(); }
    await copyBranchfsPathRobust(source, target);
    expect(await fs.readFile(target, "utf8")).toBe("incoming");
  });

  test("failed disposal retains the lease and can be retried", async () => {
    const rootPath = await fixture.createRepoClone("disposal");
    const events: string[] = [];
    const manager = createBranchfsManager({ rootPath, runId: "owned" }, { onTrace: trace => events.push(trace.stage) });
    const lease = await manager.prepareExperimentLease();
    const blocked = Object.assign(new Error("workspace is locked"), { code: "EBUSY" });
    const remove = spyOn(fs, "rm").mockRejectedValue(blocked);
    try {
      await expect(manager.discardExperiment(lease)).rejects.toBe(blocked);
      const retention = await pruneBranchfsRoots({ repoRoot: rootPath, mode: "retention",
        retention: { maxAgeMs: 0, maxRoots: 0, maxBytes: 0, partialGraceMs: 0 } });
      expect(retention.rootsDeleted).toBe(0);
      expect(retention.rootsScanned).toBe(0);
      expect(retention.warnings).toEqual([]);
      expect(existsSync(lease.repoMountPath)).toBe(true);
      expect(events).not.toContain("branchfs-unmounted");
    } finally { remove.mockRestore(); }
    await manager.discardExperiment(lease);
    expect(existsSync(path.dirname(lease.repoMountPath))).toBe(false);
    expect(events.filter(event => event === "branchfs-unmounted")).toHaveLength(1);
    const replacement = await manager.prepareExperimentLease();
    await manager.discardExperiment(replacement);
  });

  test("manual cleanup reports failed deletion instead of success", async () => {
    const rootPath = await fixture.createRepoClone("manual-cleanup");
    const manager = createBranchfsManager({ rootPath, runId: "manual" });
    const lease = await manager.prepareExperimentLease();
    const remove = spyOn(fs, "rm").mockRejectedValue(Object.assign(new Error("locked"), { code: "EBUSY" }));
    try {
      const result = await pruneBranchfsRoots({ repoRoot: rootPath, mode: "all" });
      expect(result.rootsDeleted).toBe(0);
      expect(result.rootsRetained).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(existsSync(lease.repoMountPath)).toBe(true);
    } finally { remove.mockRestore(); }
    const result = await pruneBranchfsRoots({ repoRoot: rootPath, mode: "all" });
    expect(result.rootsDeleted).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(existsSync(path.dirname(lease.repoMountPath))).toBe(false);
    const replacement = await manager.prepareExperimentLease();
    await manager.discardExperiment(replacement);
  });
});
