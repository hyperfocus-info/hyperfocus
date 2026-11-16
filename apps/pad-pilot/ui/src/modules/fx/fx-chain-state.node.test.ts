import { spawnBackgroundProcessSync } from '@hyperfocus/desktop-runtime/process';
import { describe, expect, test } from "bun:test";

describe("FX chain state Node import contract", () => {
  test("loads pure state and registry code without browser globals", () => {
    const result = spawnBackgroundProcessSync({
      cmd: [
        process.execPath,
        "--conditions",
        "browser",
        "-e",
        'delete globalThis.window; delete globalThis.document; await import("./ui/src/modules/fx/fx-chain-state.ts");',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        BUN_OPTIONS: "",
      },
      stderr: "pipe",
      stdout: "pipe",
    });

    expect(new TextDecoder().decode(result.stderr)).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
