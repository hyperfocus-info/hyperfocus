import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createClientLeaseController } from "./client-lease";
import { parseDesktopProtocolTarget, resolveDesktopTarget } from "./deep-link";
import { checkStandaloneUpdate, compareVersions, installStandaloneUpdate } from "./version-update";

describe("desktop deep links", () => {
  test("preserves Windows drive paths in both supported URL shapes", () => {
    expect(parseDesktopProtocolTarget("ide://C:/work/game/src/main.ts")).toBe("C:/work/game/src/main.ts");
    expect(parseDesktopProtocolTarget("ide:///C:/work/My%20Game")).toBe("C:/work/My Game");
  });

  test("opens a file in the deepest owning project", async () => {
    const root = path.resolve("C:/work/game");
    const nestedRoot = path.join(root, "packages", "player");
    const target = path.join(nestedRoot, "src", "main.ts");
    const resolved = await resolveDesktopTarget({
      target,
      projectRoots: [root, nestedRoot],
      fileSystem: {
        async stat() {
          return { isFile: () => true, isDirectory: () => false };
        }
      }
    });
    expect(resolved).toMatchObject({ kind: "file", projectRoot: nestedRoot, filePath: "src/main.ts" });
  });

  test("accepts double-dot child names but excludes sibling projects", async () => {
    const root = path.resolve("audit/project");
    const fileSystem = { stat: async () => ({ isFile: () => true, isDirectory: () => false }) };
    const child = await resolveDesktopTarget({ target: path.join(root, "..notes/file.md"), projectRoots: [root], fileSystem });
    expect(child).toMatchObject({ projectRoot: root, filePath: "..notes/file.md" });
    const sibling = await resolveDesktopTarget({ target: path.join(root, "../sibling/file.md"), projectRoots: [root], fileSystem });
    expect(sibling.projectRoot).toBe(path.resolve(root, "../sibling"));
  });
});

describe("desktop client leases", () => {
  test("cancels idle shutdown when another client connects", async () => {
    let stopped = 0;
    const controller = createClientLeaseController({ idleGraceMs: 5, onIdle: () => { stopped += 1; } });
    controller.connected();
    controller.disconnected();
    controller.connected();
    await Bun.sleep(15);
    expect(stopped).toBe(0);
    controller.disconnected();
    await Bun.sleep(15);
    expect(stopped).toBe(1);
    controller.dispose();
  });
});

describe("standalone updates", () => {
  test("does not contact the source until the consumer opts in", async () => {
    let calls = 0;
    const source = { async getLatestRelease() { calls += 1; return { version: "2.0.0" }; } };
    expect(await checkStandaloneUpdate({ currentVersion: "1.0.0", source })).toEqual({
      status: "disabled",
      currentVersion: "1.0.0"
    });
    expect(calls).toBe(0);
    expect(await checkStandaloneUpdate({ enabled: true, currentVersion: "1.0.0", source })).toMatchObject({ status: "available" });
  });

  test("compares tagged numeric versions", () => {
    expect(compareVersions("v1.10.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0-beta.2")).toBe(1);
  });

  test("offers stable to RC users and orders prerelease identifiers without precision loss", async () => {
    const versions = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"];
    for (let i = 1; i < versions.length; i++) {
      expect(compareVersions(versions[i - 1]!, versions[i]!)).toBe(-1);
      expect(compareVersions(versions[i]!, versions[i - 1]!)).toBe(1);
    }
    expect(compareVersions("1.2.0+build.1", "1.2+build.2")).toBe(0);
    expect(compareVersions("1.0.0-9007199254740992", "1.0.0-9007199254740993")).toBe(-1);
    expect(await checkStandaloneUpdate({ enabled: true, currentVersion: "1.2.0-rc.1", source: { getLatestRelease: async () => ({ version: "1.2.0" }) } })).toMatchObject({ status: "available" });
    for (const invalid of ["1.0.0garbage", "1.0.0-", "1.0.0-01", "1.0.0+", "1." + "0".repeat(257)]) {
      expect(() => compareVersions(invalid, "1.0.0")).toThrow("Invalid version");
    }
  });

  test("delegates installation only after explicit consumer approval", async () => {
    let installs = 0;
    const update = {
      status: "available" as const,
      currentVersion: "1.0.0",
      latest: { version: "2.0.0", downloadUrl: "https://example.com/app.zip" }
    };
    const installer = { async installRelease() { installs += 1; return { restartRequired: true }; } };
    expect(await installStandaloneUpdate({ update, installer })).toEqual({ status: "skipped" });
    expect(await installStandaloneUpdate({ approved: true, update, installer })).toMatchObject({
      status: "installed",
      receipt: { restartRequired: true }
    });
    expect(installs).toBe(1);
  });
});
