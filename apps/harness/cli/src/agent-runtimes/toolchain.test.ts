import { describe, expect, test } from "bun:test";
import path from "node:path";
import { buildToolchainPath, resolveBundledBunPath, resolveBundledRipgrepPath } from "./toolchain";

describe("agent runtime toolchain", () => {
  test("resolves bundled ripgrep when dependency is installed", () => {
    const rgPath = resolveBundledRipgrepPath();
    expect(rgPath?.endsWith(path.join("bin", "rg.exe")) || rgPath?.endsWith(path.join("bin", "rg"))).toBe(true);
  });

  test("prepends bundled tool directory once", () => {
    const rgPath = resolveBundledRipgrepPath();
    if (!rgPath) {
      throw new Error("Expected bundled rg");
    }

    const toolDir = path.dirname(rgPath);
    const once = buildToolchainPath({ basePath: "C:\\Windows", platform: "win32" });
    const twice = buildToolchainPath({ basePath: once, platform: "win32" });

    expect(once?.startsWith(`${toolDir};`)).toBe(true);
    expect(twice).toBe(once);
  });

  test("puts the installed Bun executable on the agent path", () => {
    const bunPath = resolveBundledBunPath();
    expect(bunPath?.endsWith(path.join("bin", process.platform === "win32" ? "bun.exe" : "bun"))).toBe(true);
    expect(buildToolchainPath({ basePath: "C:\\Windows", platform: "win32" })?.split(";"))
      .toContain(path.dirname(bunPath!));
  });
});
