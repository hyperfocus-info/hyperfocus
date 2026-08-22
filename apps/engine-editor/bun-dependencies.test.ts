import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dependencyArgv, manageBunDependencies, validatePackageSpecs } from "./bun-dependencies.ts";

describe("editor Bun dependency wrapper", () => {
  test("builds explicit argv without invoking a shell", () => {
    expect(dependencyArgv({ command: "add", project: ".", packages: ["zod@4"], section: "devDependencies", exact: true })).toEqual(["add", "--dev", "--exact", "zod@4"]);
    expect(dependencyArgv({ command: "add", project: ".", packages: ["@scope/custom-lib"], section: "peerDependencies", trust: true })).toEqual(["add", "--peer", "--trust", "@scope/custom-lib"]);
    expect(dependencyArgv({ command: "remove", project: ".", packages: ["zod"] })).toEqual(["remove", "zod"]);
    expect(dependencyArgv({ command: "install", project: ".", frozen: true })).toEqual(["install", "--frozen-lockfile"]);
  });

  test("rejects flag injection and control characters", () => {
    expect(() => validatePackageSpecs(["--cwd=C:/elsewhere"])).toThrow("Invalid package spec");
    expect(() => validatePackageSpecs(["safe\nmalicious"])).toThrow("Invalid package spec");
    expect(() => validatePackageSpecs([])).toThrow("At least one package");
  });

  test("uses the selected project as cwd and reports dependency state", async () => {
    const root = join(process.cwd(), ".tmp-test-data", `editor-deps-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "package.json"), `${JSON.stringify({ dependencies: { solid: "1.0.0" }, devDependencies: { typescript: "6.0.0" } }, null, 2)}\n`);
    const calls: Array<{ cwd: string; argv: string[] }> = [];
    try {
      const result = await manageBunDependencies({ command: "add", project: root, packages: ["zod"] }, async (options) => {
        calls.push(options);
        return { exitCode: 0, stdout: "installed", stderr: "" };
      });
      expect(calls).toEqual([{ cwd: root, argv: ["add", "zod"] }]);
      expect(result.dependencies.dependencies).toEqual({ solid: "1.0.0" });
      expect(result.dependencies.devDependencies).toEqual({ typescript: "6.0.0" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires an existing package manifest", async () => {
    const root = join(process.cwd(), ".tmp-test-data", `editor-deps-missing-${crypto.randomUUID()}`);
    await mkdir(root, { recursive: true });
    try {
      await expect(manageBunDependencies({ command: "list", project: root })).rejects.toThrow("No package.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
