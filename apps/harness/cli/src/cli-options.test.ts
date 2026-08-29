import { describe, expect, test } from "bun:test";
import { parseCliOptions } from "./cli-options";

describe("CLI option parser", () => {
  test("accepts known flags and values", () => {
    const parsed = parseCliOptions(["--doctor", "--json"], {
      flags: ["--doctor", "--json"]
    });

    expect(parsed.flags.has("--doctor")).toBe(true);
    expect(parsed.flags.has("--json")).toBe(true);
  });

  test("rejects unknown flags and conflicts as usage errors", () => {
    expect(() =>
      parseCliOptions(["--wat"], {
        flags: ["--help"]
      })
    ).toThrow("Unknown option: --wat");

    expect(() =>
      parseCliOptions(["--open", "--no-open"], {
        flags: ["--open", "--no-open"],
        conflicts: [["--open", "--no-open"]]
      })
    ).toThrow("Conflicting options");
  });

  test("rejects missing values", () => {
    expect(() =>
      parseCliOptions(["--target"], {
        flags: ["--target"],
        valueFlags: ["--target"]
      })
    ).toThrow("Missing value");
  });

  test("accepts repair as a doctor modifier", () => {
    const parsed = parseCliOptions(["--doctor", "--repair"], {
      flags: ["--doctor", "--repair"]
    });

    expect(parsed.flags.has("--doctor")).toBe(true);
    expect(parsed.flags.has("--repair")).toBe(true);
  });
});
