import { describe, expect, test } from "bun:test";
import { parseDependencyArgs } from "./editor-cli.ts";

describe("editor command line", () => {
  test("parses package additions with an explicit dependency section", () => {
    expect(parseDependencyArgs(["add", "zod@4", "@scope/lib", "--project", "C:/game", "--optional", "--exact"])).toEqual({
      command: "add",
      project: "C:/game",
      packages: ["zod@4", "@scope/lib"],
      section: "optionalDependencies",
      exact: true,
      trust: false,
    });
  });

  test("defaults project directory and supports frozen installs", () => {
    expect(parseDependencyArgs(["install", "--frozen"])).toEqual({ command: "install", project: process.cwd(), frozen: true });
  });

  test("rejects unknown dependency commands", () => {
    expect(() => parseDependencyArgs(["upgrade"])).toThrow("list, install, add, remove");
  });

  test("rejects missing option values and conflicting dependency sections", () => {
    expect(() => parseDependencyArgs(["list", "--project"])).toThrow("requires a value");
    expect(() => parseDependencyArgs(["add", "zod", "--dev", "--peer"])).toThrow("only one dependency section");
  });
});
