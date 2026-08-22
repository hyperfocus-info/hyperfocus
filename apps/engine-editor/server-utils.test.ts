import { describe, expect, test } from "bun:test";
import { parseTcpPort, relativePathWithin } from "./server-utils";

describe("editor server boundaries", () => {
  test("validates configured ports", () => {
    expect(parseTcpPort(undefined, 8796, "PORT")).toBe(8796);
    expect(parseTcpPort("9000", 8796, "PORT")).toBe(9000);
    expect(() => parseTcpPort("0", 8796, "PORT")).toThrow();
  });

  test("rejects files outside the distribution root", () => {
    expect(relativePathWithin("C:\\app", "C:\\app\\dist\\main.js")).toBe("dist\\main.js");
    expect(relativePathWithin("C:\\app", "C:\\secret.txt")).toBeNull();
  });
});

