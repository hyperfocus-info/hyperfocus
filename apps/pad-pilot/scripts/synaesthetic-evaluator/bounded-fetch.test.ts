import { describe, expect, it } from "bun:test";

import { boundedFetchBytes, decodeUtf8 } from "./bounded-fetch";
import { createHttpRewriteSkill } from "./behavior-synthesizer";

describe("boundedFetchBytes", () => {
  it("rejects oversized streamed responses", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("x".repeat(2_048)),
    });
    try {
      await expect(boundedFetchBytes(server.url, { maxBytes: 64, timeoutMs: 2_000 })).rejects.toThrow("exceeded 64 bytes");
    } finally {
      await server.stop();
    }
  });

  it("enforces explicit redirect limits", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: (request) => new URL(request.url).pathname === "/redirect"
        ? Response.redirect(new URL("/done", request.url), 302)
        : new Response("done"),
    });
    try {
      await expect(boundedFetchBytes(new URL("/redirect", server.url), {
        maxBytes: 64,
        maxRedirects: 0,
        timeoutMs: 2_000,
      })).rejects.toThrow("exceeded 0 redirects");
      const result = await boundedFetchBytes(new URL("/redirect", server.url), {
        maxBytes: 64,
        maxRedirects: 1,
        timeoutMs: 2_000,
      });
      expect(decodeUtf8(result.bytes)).toBe("done");
    } finally {
      await server.stop();
    }
  });

  it("strips credentials before a cross-origin redirect", async () => {
    const destination = Bun.serve({
      port: 0,
      fetch: (request) => new Response(request.headers.get("authorization") ?? "none"),
    });
    const redirector = Bun.serve({
      port: 0,
      fetch: () => Response.redirect(destination.url, 307),
    });
    try {
      const result = await boundedFetchBytes(redirector.url, {
        headers: { authorization: "Bearer secret" },
        maxBytes: 64,
        maxRedirects: 1,
        timeoutMs: 2_000,
      });
      expect(decodeUtf8(result.bytes)).toBe("none");
    } finally {
      await redirector.stop();
      await destination.stop();
    }
  });

  it("refuses HTTPS-to-HTTP redirect downgrades", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = new Proxy(originalFetch, {
      apply: () => Promise.resolve(new Response(null, {
        status: 302,
        headers: { location: "http://insecure.example/file" },
      })),
    });
    try {
      await expect(boundedFetchBytes("https://secure.example/file", {
        maxBytes: 64,
        maxRedirects: 1,
        timeoutMs: 1_000,
      })).rejects.toThrow("downgrade HTTPS to HTTP");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("aborts the whole request at its deadline", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: async () => {
        await Bun.sleep(500);
        return new Response("late");
      },
    });
    try {
      await expect(boundedFetchBytes(server.url, { maxBytes: 64, timeoutMs: 30 })).rejects.toThrow();
    } finally {
      await server.stop();
    }
  });

  it("bounds user-configured LLM rewrite responses", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ source: "x".repeat(2_048) }),
    });
    try {
      const rewrite = createHttpRewriteSkill({
        endpoint: server.url.href,
        maxResponseBytes: 128,
        timeoutMs: 2_000,
      });
      await expect(rewrite({
        analyzerName: "Test",
        previousSource: "export default {};",
        report: { evaluatedAt: 0, failures: [], metrics: [], successScore: 0.5 },
        sourcePath: "test.ts",
      })).rejects.toThrow("exceeded 128 bytes");
    } finally {
      await server.stop();
    }
  });
});
