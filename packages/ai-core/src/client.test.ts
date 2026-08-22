import { describe, expect, test } from "bun:test";
import { normalizeHarnessEndpoint } from "./client";

describe("harness endpoint normalization", () => {
  test("accepts local origins and explicit websocket endpoints", () => {
    expect(normalizeHarnessEndpoint("127.0.0.1:8787")).toBe("ws://127.0.0.1:8787/ws");
    expect(normalizeHarnessEndpoint("https://harness.example.test/anything?q=1")).toBe("wss://harness.example.test/ws");
    expect(normalizeHarnessEndpoint("ws://localhost:8787/ws")).toBe("ws://localhost:8787/ws");
  });

  test("rejects empty and unrelated protocols", () => {
    expect(() => normalizeHarnessEndpoint(" ")).toThrow("required");
    expect(() => normalizeHarnessEndpoint("file:///tmp/socket")).toThrow("HTTP(S) or WS(S)");
  });
});

