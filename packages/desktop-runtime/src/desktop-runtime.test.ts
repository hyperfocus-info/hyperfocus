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
    expect(compareVersions("1.0.0", "1.0.0-beta.2")).toBe(0);
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
