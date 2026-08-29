import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { assertDistinctPorts, createStaticFileHandler, parseTcpPort, relativePathWithin } from "./server.ts";

test("parseTcpPort accepts only concrete TCP ports", () => {
  expect(parseTcpPort(undefined, 8_793)).toBe(8_793);
  expect(parseTcpPort("8794", 8_793)).toBe(8_794);
  for (const value of [0, -1, 65_536, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "not-a-port"]) {
    expect(() => parseTcpPort(value, 8_793, "TEST_PORT")).toThrow("TEST_PORT");
  }
});

test("static file handler enforces allowlists and methods", async () => {
  const handler = createStaticFileHandler({
    root: import.meta.dir,
    index: "server.ts",
    allow: (path) => path === "server.ts",
  });
  expect((await handler(new Request("http://demo.test/"))).status).toBe(200);
  expect((await handler(new Request("http://demo.test/text-utils.ts"))).status).toBe(404);
  expect((await handler(new Request("http://demo.test/", { method: "POST" }))).status).toBe(405);
  expect(await (await handler(new Request("http://demo.test/"))).text()).toContain("parseTcpPort");
});

test("assertDistinctPorts rejects a listener collision", () => {
  expect(() => assertDistinctPorts(8_793, 8_793, "HTTP_PORT", "WS_PORT")).toThrow("different ports");
  expect(() => assertDistinctPorts(8_793, 8_794, "HTTP_PORT", "WS_PORT")).not.toThrow();
});

test("relativePathWithin rejects parent and sibling paths", () => {
  const root = resolve("examples", "demo");
  expect(relativePathWithin(root, resolve(root, "assets", "sprite.png"))).toBe("assets/sprite.png");
  expect(relativePathWithin(root, resolve(root, "..", "secret.txt"))).toBeNull();
  expect(relativePathWithin(root, resolve(`${root}-other`, "file.txt"))).toBeNull();
});
