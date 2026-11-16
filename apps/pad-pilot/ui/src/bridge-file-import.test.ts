import { z } from "zod";
import { afterEach, describe, expect, it } from "bun:test";
import { importHostFile, pickHostFile, resetBridgeStateForTests } from "./bridge";
import { PADPILOT_FILE_IMPORT_MAX_BYTES } from "@hyperfocus/pad-pilot/file-import";

describe("bridge file import", () => {
  afterEach(() => {
    delete window.__JUCE__;
    resetBridgeStateForTests();
  });

  function installNativeInvoker(
    functionNames: string[],
    handler: (name: string, params: unknown[]) => unknown,
  ) {
    let completionListener: ((payload: unknown) => void) | undefined;
    window.__JUCE__ = {
      backend: {
        addEventListener: (_eventId, listener) => {
          completionListener = listener;
          return 0;
        },
        emitEvent: (eventId, payload) => {
          if (eventId !== "__juce__invoke") {
            return;
          }
          const request = z.object({name:z.string(),params:z.array(z.unknown()),resultId:z.number()}).passthrough().parse(payload);
          completionListener?.({
            promiseId: request.resultId,
            result: handler(request.name, request.params),
          });
        },
      },
      initializationData: {
        __juce__functions: functionNames,
      },
    };
  }

  it("returns a synthetic managed path in dev host for File imports without native bridge", async () => {
    const file = new File(["abc"], "kick.wav", { type: "audio/wav" });

    const imported = await importHostFile(file, { category: "sample" });

    expect(imported.name).toBe("kick.wav");
    expect(imported.byteSize).toBe(3);
    expect(imported.mimeType).toBe("audio/wav");
    expect(imported.contentId.length).toBeGreaterThan(0);
    expect(imported.path).toStartWith("virtual://padpilot/media/samples/");
    expect(imported.path).toEndWith(".wav");
  });

  it("keeps impulse responses in their own managed category", async () => {
    const imported = await importHostFile(
      new File(["ir"], "room.wav", { type: "audio/wav" }),
      { category: "impulse-response" },
    );

    expect(imported.path).toStartWith("virtual://padpilot/media/impulse-responses/");
  });

  it("bounds retained dev-host imports and evicts the oldest payload", async () => {
    const importedIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const imported = await importHostFile(
        new File([`sample-${index}`], `sample-${index}.wav`, { type: "audio/wav" }),
      );
      importedIds.push(imported.contentId);
    }

    expect(Object.keys(window.__PADPILOT_DEV_IMPORTED_FILES__ ?? {})).toHaveLength(4);
    expect(window.__PADPILOT_DEV_IMPORTED_FILES__?.[importedIds[0]!]).toBeUndefined();
    expect(window.__PADPILOT_DEV_IMPORTED_FILES__?.[importedIds[4]!]?.byteSize).toBe(8);
  });

  it("streams native file imports in chunks and returns the managed file record", async () => {
    const appendedChunks: string[] = [];
    let beginRequest: Record<string, unknown> | null = null;

    installNativeInvoker(
      [
        "padpilotBeginFileImport",
        "padpilotAppendFileImport",
        "padpilotFinishFileImport",
        "padpilotCancelFileImport",
      ],
      (name, params) => {
        if (name === "padpilotBeginFileImport") {
          beginRequest = z.record(z.unknown()).parse(JSON.parse(String(params[0] ?? "{}")));
          return JSON.stringify({ importId: "import-1" });
        }
        if (name === "padpilotAppendFileImport") {
          appendedChunks.push(String(params[1] ?? ""));
          return JSON.stringify({ receivedBytes: appendedChunks.length });
        }
        if (name === "padpilotFinishFileImport") {
          return JSON.stringify({
            byteSize: 300000,
            contentId: "content-1",
            mimeType: "audio/wav",
            name: "break.wav",
            path: "C:/PadPilot/media/samples/content-1.wav",
          });
        }
        return JSON.stringify({ cancelled: true });
      },
    );

    const file = new File([new Uint8Array(300000)], "break.wav", { type: "audio/wav" });
    const imported = await importHostFile(file, { category: "sample" });

    expect(beginRequest).toEqual(expect.objectContaining({
      byteSize: 300000,
      category: "sample",
      maxBytes: PADPILOT_FILE_IMPORT_MAX_BYTES,
      mimeType: "audio/wav",
      name: "break.wav",
    }));
    expect(appendedChunks).toHaveLength(2);
    expect(imported).toEqual({
      byteSize: 300000,
      contentId: "content-1",
      mimeType: "audio/wav",
      name: "break.wav",
      path: "C:/PadPilot/media/samples/content-1.wav",
    });
  });

  it("uses the native bridge even when JUCE does not publish a function name list", async () => {
    const calls: string[] = [];
    let completionListener: ((payload: unknown) => void) | undefined;
    window.__JUCE__ = {
      backend: {
        addEventListener: (_eventId, listener) => {
          completionListener = listener;
          return 0;
        },
        emitEvent: (eventId, payload) => {
          if (eventId !== "__juce__invoke") {
            return;
          }
          const request = z.object({name:z.string(),params:z.array(z.unknown()),resultId:z.number()}).passthrough().parse(payload);
          calls.push(request.name);
          const result = request.name === "padpilotBeginFileImport"
            ? JSON.stringify({ importId: "import-3" })
            : request.name === "padpilotAppendFileImport"
              ? JSON.stringify({ receivedBytes: 4 })
              : request.name === "padpilotFinishFileImport"
                ? JSON.stringify({
                    byteSize: 4,
                    contentId: "content-3",
                    mimeType: "audio/wav",
                    name: "snare.wav",
                    path: "C:/PadPilot/media/samples/content-3.wav",
                  })
                : JSON.stringify({ cancelled: true });
          completionListener?.({
            promiseId: request.resultId,
            result,
          });
        },
      },
      initializationData: {
        __juce__functions: [],
      },
    };

    const imported = await importHostFile(new File(["test"], "snare.wav", { type: "audio/wav" }));

    expect(calls).toEqual([
      "padpilotBeginFileImport",
      "padpilotAppendFileImport",
      "padpilotFinishFileImport",
    ]);
    expect(imported.path).toBe("C:/PadPilot/media/samples/content-3.wav");
  });

  it("rejects and removes native calls that never complete", async () => {
    window.__JUCE__ = {
      backend: {
        addEventListener: () => 0,
        emitEvent: () => undefined,
      },
      initializationData: {
        __juce__functions: ["padpilotPickFile"],
      },
    };

    const originalSetTimeout = window.setTimeout;
    Object.defineProperty(window, "setTimeout", { configurable: true, writable: true, value: (handler: TimerHandler) => {
      queueMicrotask(() => {
        if (typeof handler === "function") {
          handler();
        }
      });
      return originalSetTimeout(() => {}, 0);
    } });

    try {
      await expect(pickHostFile()).rejects.toThrow("Native function padpilotPickFile timed out.");
    } finally {
      window.setTimeout = originalSetTimeout;
    }
  });

  it("rejects malformed native JSON responses and requested-size violations", async () => {
    installNativeInvoker(["padpilotPickFile"], () => JSON.stringify({ cancelled: false, path: 17 }));
    await expect(pickHostFile()).rejects.toThrow("native file picker returned an invalid response");

    resetBridgeStateForTests();
    installNativeInvoker(["padpilotImportFilePath"], () => JSON.stringify({
      byteSize: 9,
      contentId: "content-oversize",
      mimeType: "audio/wav",
      name: "kick.wav",
      path: "C:/PadPilot/media/kick.wav",
    }));
    await expect(importHostFile("C:/samples/kick.wav", { maxBytes: 4 })).rejects.toThrow(
      "exceeded the requested size limit",
    );
  });

  it("cancels the native import session when a chunk append fails", async () => {
    const calls: string[] = [];

    installNativeInvoker(
      [
        "padpilotBeginFileImport",
        "padpilotAppendFileImport",
        "padpilotFinishFileImport",
        "padpilotCancelFileImport",
      ],
      (name) => {
        calls.push(name);
        if (name === "padpilotBeginFileImport") {
          return JSON.stringify({ importId: "import-2" });
        }
        if (name === "padpilotAppendFileImport") {
          return "error:chunk write failed";
        }
        if (name === "padpilotCancelFileImport") {
          return JSON.stringify({ cancelled: true });
        }
        return JSON.stringify({});
      },
    );

    const file = new File([new Uint8Array(8)], "broken.wav", { type: "audio/wav" });

    await expect(importHostFile(file)).rejects.toThrow("chunk write failed");
    expect(calls).toEqual([
      "padpilotBeginFileImport",
      "padpilotAppendFileImport",
      "padpilotCancelFileImport",
    ]);
  });

  it("rejects oversized imports before starting any native session", async () => {
    const file = new File([new Uint8Array(PADPILOT_FILE_IMPORT_MAX_BYTES + 1)], "huge.wav", { type: "audio/wav" });

    await expect(importHostFile(file, { maxBytes: Number.MAX_SAFE_INTEGER })).rejects.toThrow(
      "Imported sample exceeds the configured size limit.",
    );
  });
});
