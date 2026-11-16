import { describe, expect, spyOn, test } from "bun:test";
import { createStreamPump, drainStreamPumps } from "./stream-pump";

describe("StreamPump", () => {
  test("UTF-8 counting does not allocate encoded arrays per character", async () => {
    const encode = spyOn(TextEncoder.prototype, "encode");
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 8192, onFlush() {} });
    try {
      pump.push("a".repeat(4096));
      await pump.end();
      expect(encode).toHaveBeenCalledTimes(2);
    } finally { pump.close(); encode.mockRestore(); }
  });

  test("flushes successive timed windows and re-arms after a size flush", async () => {
    const flushed: string[] = [];
    let next = Promise.withResolvers<void>();
    const pump = createStreamPump({ flushIntervalMs: 5, maxBufferedBytes: 4,
      onFlush(text) { flushed.push(text); next.resolve(); } });
    try {
      for (const text of ["a", "b", "1234", "c", "d"]) {
        next = Promise.withResolvers<void>();
        if (text === "1234") { pump.push("12"); pump.push("34"); }
        else pump.push(text);
        await next.promise;
      }
      await pump.end();
      expect(flushed).toEqual(["a", "b", "1234", "c", "d"]);
    } finally { pump.close(); }
  }, 1000);

  test("byte counting preserves multibyte code points and lone surrogates", async () => {
    const text = "a\u00e9\u0800\ud83d\ude00\ud800z\udc00";
    const flushed: string[] = [];
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 4,
      onFlush(chunk) { flushed.push(chunk); } });
    pump.push(text);
    await pump.end();
    expect(flushed.join("")).toBe(text);
    expect(flushed.map((chunk) => new TextEncoder().encode(chunk).length)).toEqual([3, 3, 4, 4, 3]);
  });

  test("a synchronous first-flush failure does not latch the drain", async () => {
    const flushed: string[] = [];
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 1,
      onFlush(text) { if (text === "a") throw new Error("first flush failed"); flushed.push(text); } });
    pump.push("a");
    pump.push("b");
    await expect(pump.flush()).rejects.toThrow("first flush failed");
    await pump.end();
    expect(flushed).toEqual(["b"]);
  });

  test("reentrant pushes preserve serial callback order", async () => {
    const flushed: string[] = [];
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 1,
      onFlush(text) { if (text === "a") pump.push("b"); flushed.push(text); } });
    pump.push("a");
    await pump.end();
    expect(flushed).toEqual(["a", "b"]);
  });

  test("coalesces chunks until flush", async () => {
    const flushed: string[] = [];
    const pump = createStreamPump({
      flushIntervalMs: 10_000,
      maxBufferedBytes: 1024,
      onFlush: (text) => {
        flushed.push(text);
      }
    });

    pump.push("a");
    pump.push("b");
    expect(flushed).toEqual([]);

    await pump.flush();
    expect(flushed).toEqual(["ab"]);
  });

  test("flushes when byte cap is reached", async () => {
    const flushed: string[] = [];
    const pump = createStreamPump({
      flushIntervalMs: 10_000,
      maxBufferedBytes: 3,
      onFlush: (text) => {
        flushed.push(text);
      }
    });

    pump.push("abc");
    await pump.flush();
    expect(flushed).toEqual(["abc"]);
  });

  test("splits boundary-crossing and oversized chunks without breaking UTF-8 characters", async () => {
    const flushed: string[] = [];
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 5,
      onFlush: (text) => { flushed.push(text); } });

    pump.push("abcd");
    pump.push("😀efghij");
    await pump.flush();

    expect(flushed.join("")).toBe("abcd😀efghij");
    expect(flushed.map((text) => new TextEncoder().encode(text).byteLength)).toEqual([4, 5, 5]);
  });

  test("serializes asynchronous flushes and reports errors after draining later chunks", async () => {
    const flushed: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 2,
      async onFlush(text) {
        if (text === "ab") await firstPending;
        flushed.push(text);
        if (text === "cd") throw new Error("flush failed");
      } });

    pump.push("abcdef");
    expect(flushed).toEqual([]);
    releaseFirst?.();
    await expect(pump.flush()).rejects.toThrow("flush failed");
    expect(flushed).toEqual(["ab", "cd", "ef"]);
  });

  test("end drains before resolving, reports failure, and rejects later output", async () => {
    const flushed: string[] = []; const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 8,
      onFlush(text) { flushed.push(text); if (text === "terminal") throw new Error("terminal flush failed"); } });
    pump.push("terminal"); await expect(pump.end()).rejects.toThrow("terminal flush failed"); pump.push("late");
    await pump.flush(); expect(flushed).toEqual(["terminal"]);
  });

  test("rejects one oversized push without publishing a truncated prefix", async () => {
    const flushed: string[] = []; const errors: string[] = [];
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 2, maxTotalChars: 4,
      onFlush: (text) => { flushed.push(text); }, onError: (error) => errors.push(String(error)) });
    pump.push("abcde"); await expect(pump.flush()).rejects.toThrow("exceeds 4 characters");
    expect(flushed).toEqual([]); expect(errors).toHaveLength(1);
  });

  test("bounds queued backlog behind a blocked flush and fails terminally", async () => {
    const flushed: string[] = []; let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 2, maxTotalChars: 4,
      async onFlush(text) { if (text === "ab") await blocked; flushed.push(text); } });
    pump.push("ab"); pump.push("cd"); pump.push("e"); release?.();
    await expect(pump.flush()).rejects.toThrow("exceeds 4 characters"); expect(flushed).toEqual(["ab"]);
  });

  test("bounds UTF-8 queued bytes independently from total output", async () => {
    const flushed: string[] = [];
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 4, maxQueuedBytes: 6,
      async onFlush(text) { if (text === "😀") await blocked; flushed.push(text); } });

    pump.push("😀");
    pump.push("é");
    pump.push("a");
    release?.();

    await expect(pump.flush()).rejects.toThrow("exceeds 6 UTF-8 bytes");
    expect(flushed).toEqual(["😀"]);
  });

  test("drains every queued tail before terminal cleanup settles", async () => {
    const flushed: string[] = [];
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 2,
      async onFlush(text) { if (text === "ab") await blocked; flushed.push(text); } });
    pump.push("abcdef");

    const draining = drainStreamPumps([pump]);
    expect(flushed).toEqual([]);
    release?.();
    await draining;

    expect(flushed).toEqual(["ab", "cd", "ef"]);
  });

  test("terminal cleanup settles pump overflow errors", async () => {
    const pump = createStreamPump({ flushIntervalMs: 10_000, maxBufferedBytes: 2, maxQueuedBytes: 2,
      onFlush() {} });
    pump.push("overflow");

    await expect(drainStreamPumps([pump])).resolves.toHaveLength(1);
    await expect(pump.flush()).resolves.toBeUndefined();
  });
});
