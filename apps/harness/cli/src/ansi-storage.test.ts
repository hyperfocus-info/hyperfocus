import { describe, expect, test } from "bun:test";
import { stringifyAnsiFree, stripAnsiForStorage } from "./ansi-storage";

describe("ANSI-safe persistence", () => {
  test("removes color, cursor, and hyperlink escapes while preserving text", () => {
    const value = "\u001B[31mfailed\u001B[0m\n\u001B[2Knext\u001B]8;;https://example.com\u0007link\u001B]8;;\u0007";

    expect(stripAnsiForStorage(value)).toBe("failed\nnextlink");
  });

  test("removes escapes from nested structured output", () => {
    expect(JSON.parse(stringifyAnsiFree({ output: "\u001B[32mok\u001B[0m", nested: ["plain"] }))).toEqual({
      output: "ok",
      nested: ["plain"]
    });
  });
});
