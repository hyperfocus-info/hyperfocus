import { describe, expect, test } from "bun:test";
import { CLI_HELP, parseHarnessCliOptions } from "./index-main";

describe("harness CLI options", () => {
  test("documents doctor as read-only and repair as opt-in", () => {
    expect(CLI_HELP).toContain("--doctor      Inspect setup health without changing local files");
    expect(CLI_HELP).toContain("--repair      With --doctor");
  });

  test("accepts repair only as a doctor modifier", () => {
    expect(parseHarnessCliOptions(["--doctor", "--repair"]).flags.has("--repair")).toBe(true);
    expect(() => parseHarnessCliOptions(["--repair"])).toThrow("--repair requires --doctor");
  });

  test("keeps JSON scoped to doctor", () => {
    expect(parseHarnessCliOptions(["--doctor", "--json"]).flags.has("--json")).toBe(true);
    expect(() => parseHarnessCliOptions(["--json"])).toThrow("--json requires --doctor");
  });

  test("accepts desktop protocol launches and their explicit update opt-in", () => {
    const options = parseHarnessCliOptions([
      "--ide-url",
      "ide://C:/work/game/src/main.ts",
      "--check-app-update"
    ]);
    expect(options.values.get("--ide-url")).toBe("ide://C:/work/game/src/main.ts");
    expect(options.flags.has("--check-app-update")).toBe(true);
    expect(CLI_HELP).toContain("--register-ide-protocol");
  });
});
