import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { downloadArchive, probeCraftpixDownload } from "./craftpix";

function response(body: BodyInit, options: ResponseInit & { url: string }) {
  const value = new Response(body, options);
  Object.defineProperty(value, "url", { value: options.url });
  return value;
}

describe("Craftpix health probe", () => {
  test("follows a download interstitial to a ranged ZIP probe", async () => {
    const calls: string[] = [];
    const fetcher: NonNullable<Parameters<typeof probeCraftpixDownload>[0]["fetcher"]> = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/download/94572")) return response('<div>Your download is starting</div><a href="https://files.craftpix.net/free/pack.zip">zip</a>', { status: 200, headers: { "content-type": "text/html" }, url });
      expect(new Headers(init?.headers).get("range")).toBe("bytes=0-7");
      return response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), { status: 206, headers: { "content-type": "application/zip" }, url });
    };
    const result = await probeCraftpixDownload({ downloadUrl: "https://craftpix.net/download/94572/", fetcher });
    expect(result).toEqual(expect.objectContaining({ status: "available", archiveUrl: "https://files.craftpix.net/free/pack.zip" }));
    expect(calls).toHaveLength(2);
  });

  test("reports an account page as restricted", async () => {
    const fetcher: NonNullable<Parameters<typeof probeCraftpixDownload>[0]["fetcher"]> = async (input) => response('<title>Sign in - CraftPix</title><form id="loginform"></form>', { status: 200, headers: { "content-type": "text/html" }, url: String(input) });
    const result = await probeCraftpixDownload({ downloadUrl: "https://craftpix.net/download/94572/", fetcher });
    expect(result.status).toBe("restricted");
    expect(result.detail).toContain("sign-in page");
  });
});

test("archive streaming writes exact chunks and releases its reader", async () => {
  const scratch = resolve(import.meta.dir, ".local");
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(resolve(scratch, "archive-stream-"));
  const originalFetch = globalThis.fetch;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.of(80, 75));
      controller.enqueue(Uint8Array.of(3, 4, 0, 255));
      controller.close();
    },
  });
  globalThis.fetch = Object.assign(async () => new Response(stream, { headers: { "content-type": "application/zip" } }), { preconnect: originalFetch.preconnect });
  try {
    const destination = await downloadArchive("https://craftpix.net/download/1/", root, "fixture.zip", false, 1, "fixture", {});
    expect([...readFileSync(destination)]).toEqual([80, 75, 3, 4, 0, 255]);
    expect(stream.locked).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
});
