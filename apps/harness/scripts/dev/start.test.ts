import { describe, expect, test } from "bun:test";
import path from "node:path";
import { createHarnessDevProcessOptions } from "./start";

describe("managed Harness backend development", () => {
  test("scopes Windows backend watching and suppresses automatic browser windows", () => {
    const root = path.resolve("repository");
    const options = createHarnessDevProcessOptions({ repositoryRoot: root, platform: "win32" });
    expect(options.cmd).not.toContain("--hot");
    expect(options.cmd).toContain("--no-open");
    expect(options.watchPaths).toContain(path.join(root, "apps/harness/cli/src"));
    expect(options.watchPaths).toContain(path.join(root, "packages/ai-core/src"));
    expect(options.watchPaths).toContain(path.join(root, "packages/ui/build-tools"));
    expect(options.watchPaths).not.toContain(root);
    expect(options.watchPaths).not.toContain(path.join(root, "apps/harness/ui"));
  });

  test("keeps soft reload outside Windows and forwards server-only mode", () => {
    const options = createHarnessDevProcessOptions({ repositoryRoot: process.cwd(), platform: "linux", argv: ["--server-only"] });
    expect(options.cmd).toContain("--hot");
    expect(options.cmd).toContain("--server-only");
    expect(options.watchPaths).toEqual([]);
  });
});
