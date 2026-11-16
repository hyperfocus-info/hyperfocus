import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { createUiAssetManager } from "../../ui-build";
import { runUiStartupPhase } from "./initialize";
import { resolveUiServingState } from "./ui-serving";

describe("UI serving state", () => {
  test("portable launchers require executable-adjacent UI assets without watching source", async () => {
    const calls: string[] = [];
    let managerOptions: Parameters<typeof createUiAssetManager>[0];
    const uiAssetManagerFactory: typeof createUiAssetManager = (options = {}) => {
      managerOptions = options;
      return {
        async ensureBuilt() {
          calls.push("ensureBuilt");
        },
        startWatching() {
          calls.push("startWatching");
        },
        resolveAsset() {
          return undefined;
        },
        getLiveReloadState() {
          return { revision: 0, building: false, pending: false };
        },
        dispose() {}
      };
    };
    const executablePath = path.join("C:\\", "portable", "pi-harness.exe");

    const ui = resolveUiServingState({
      serverOnly: false,
      hotDevelopmentMode: false,
      launchMode: "portable-launcher",
      executablePath,
      uiAssetManagerFactory,
      hotReloadDebouncePolicy: { scheduleMs: [1000] }
    });
    await runUiStartupPhase(undefined, ui);

    expect(managerOptions!).toMatchObject({
      assetRoot: path.join(path.dirname(executablePath), "dist", "ui"),
      buildWhenMissing: false
    });
    expect(calls).toEqual(["ensureBuilt"]);
  });
});
