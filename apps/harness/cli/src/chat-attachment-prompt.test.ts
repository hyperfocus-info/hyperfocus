import { Buffer } from "node:buffer";
import { afterEach, describe, expect, test } from "bun:test";
import {
  buildPromptAttachmentContext,
  createAttachmentContentCache,
  createBoundedAsyncCache
} from "./chat-attachment-prompt";
import { createDataUrl, createSampleDocxBuffer, createSamplePdfBuffer } from "./document-extractors/test-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("chat attachment prompt builder", () => {
  test("adds extracted document and text attachment context", async () => {
    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Review the attachments",
        attachments: [
          {
            id: "attachment-docx",
            kind: "document",
            documentType: "docx",
            name: "brief.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: createSampleDocxBuffer().length,
            url: createDataUrl(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              createSampleDocxBuffer()
            ),
            key: "attachment-docx",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-text",
            kind: "text",
            name: "notes.md",
            mimeType: "text/markdown",
            sizeBytes: 17,
            url: "data:text/markdown,ship%20smallest%20slice",
            key: "attachment-text",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.images).toHaveLength(0);
    expect(result.transcript).toContain("Attachment document docx");
    expect(result.transcript).toContain("Docx intro");
    expect(result.transcript).toContain("Cell A1\tCell B1");
    expect(result.transcript).toContain("ship smallest slice");
  });

  test("reports malformed document and fetch failures explicitly", async () => {
    globalThis.fetch = Object.assign(
      async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://example.com/fail.docx") {
          throw new Error("network down");
        }

        return new Response(createSamplePdfBuffer(), {
          status: 200,
          headers: {
            "content-type": "application/pdf"
          }
        });
      },
      { preconnect: originalFetch.preconnect }
    );

    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Inspect failure states",
        attachments: [
          {
            id: "attachment-bad-docx",
            kind: "document",
            documentType: "docx",
            name: "broken.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 24,
            url: createDataUrl(
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              Buffer.from("not-a-zip")
            ),
            key: "broken",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-fail-docx",
            kind: "document",
            documentType: "docx",
            name: "fail.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 24,
            url: "https://example.com/fail.docx",
            key: "fail",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.transcript).toContain("[Attachment document unavailable] broken.docx:");
    expect(result.transcript).toContain("[Attachment document unavailable] fail.docx: network down.");
  });

  test("caps total non-image text budget with explicit truncation", async () => {
    const oversizedText = "x".repeat(50000);
    const result = await buildPromptAttachmentContext([
      {
        id: "message-1",
        role: "user",
        kind: "plain",
        content: "Budget test",
        attachments: [
          {
            id: "attachment-pdf",
            kind: "document",
            documentType: "pdf",
            name: "spec.pdf",
            mimeType: "application/pdf",
            sizeBytes: createSamplePdfBuffer().length,
            url: createDataUrl("application/pdf", createSamplePdfBuffer()),
            key: "pdf",
            uploadedAt: new Date().toISOString()
          },
          {
            id: "attachment-text",
            kind: "text",
            name: "huge.txt",
            mimeType: "text/plain",
            sizeBytes: oversizedText.length,
            url: `data:text/plain,${oversizedText}`,
            key: "huge",
            uploadedAt: new Date().toISOString()
          }
        ],
        createdAt: new Date().toISOString()
      }
    ]);

    expect(result.transcript).toContain("Hello PDF extraction");
    expect(result.transcript).toContain("Attachment contents: moved to cacheable context block.");
    expect(result.cacheableUserBlocks).toHaveLength(1);
    expect(result.cacheableUserBlocks[0]?.text).toContain("...[truncated]");
  });

  test("caches immutable attachment extraction across prompt rebuilds", async () => {
    let fetches = 0;
    globalThis.fetch = Object.assign(
      async () => {
        fetches += 1;
        return new Response("cached once");
      },
      { preconnect: originalFetch.preconnect }
    );
    const messages = [{
      id: "message-cache",
      role: "user" as const,
      kind: "plain" as const,
      content: "Reuse it",
      attachments: [{
        id: "attachment-cache",
        kind: "text" as const,
        name: "cache.txt",
        mimeType: "text/plain",
        sizeBytes: 11,
        url: "https://example.com/cache.txt",
        key: "immutable-cache-key",
        uploadedAt: new Date().toISOString()
      }],
      createdAt: new Date().toISOString()
    }];
    const attachmentCache = createAttachmentContentCache({ maxEntries: 2 });

    await buildPromptAttachmentContext(messages, { attachmentCache });
    const result = await buildPromptAttachmentContext(messages, { attachmentCache });

    expect(fetches).toBe(1);
    expect(result.transcript).toContain("cached once");
  });

  test("does not fetch attachments after the aggregate text budget is exhausted", async () => {
    let fetches = 0;
    globalThis.fetch = Object.assign(
      async () => {
        fetches += 1;
        return new Response("x".repeat(24_000));
      },
      { preconnect: originalFetch.preconnect }
    );
    const attachments = ["one", "two", "three"].map((key) => ({
      id: `attachment-${key}`,
      kind: "text" as const,
      name: `${key}.txt`,
      mimeType: "text/plain",
      sizeBytes: 24_000,
      url: `https://example.com/${key}.txt`,
      key,
      uploadedAt: new Date().toISOString()
    }));

    const result = await buildPromptAttachmentContext([{
      id: "message-budget",
      role: "user",
      kind: "plain",
      content: "Use bounded context",
      attachments,
      createdAt: new Date().toISOString()
    }], { attachmentCache: createAttachmentContentCache() });

    expect(fetches).toBe(2);
    expect(result.transcript).toContain("three.txt");
    expect(result.transcript).toContain("text budget exhausted before this attachment");
  });
});

describe("bounded attachment cache", () => {
  test("deduplicates concurrent loads and refreshes least-recently-used order", async () => {
    const cache = createBoundedAsyncCache<string, number>({ maxEntries: 2 });
    let loads = 0;
    const loadOne = () => {
      loads += 1;
      return Promise.resolve(1);
    };

    expect(await Promise.all([cache.getOrCreate("one", loadOne), cache.getOrCreate("one", loadOne)]))
      .toEqual([1, 1]);
    await cache.getOrCreate("two", async () => 2);
    await cache.getOrCreate("one", loadOne);
    await cache.getOrCreate("three", async () => 3);
    await cache.getOrCreate("two", async () => {
      loads += 1;
      return 2;
    });

    expect(loads).toBe(2);
    expect(cache.size).toBe(2);
  });

  test("evicts failed loads so transient work can retry", async () => {
    const cache = createBoundedAsyncCache<string, number>();
    await expect(cache.getOrCreate("retry", async () => {
      throw new Error("temporary");
    })).rejects.toThrow("temporary");

    expect(await cache.getOrCreate("retry", async () => 2)).toBe(2);
  });
});
