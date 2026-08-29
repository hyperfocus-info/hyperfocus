import { afterEach, beforeEach } from "bun:test";

export type AttachmentFetchBodies = Map<string, { body: BodyInit; mimeType: string }>;

export function useAttachmentFetchFixture() {
  const bodies: AttachmentFetchBodies = new Map();
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    bodies.clear();
    originalFetch = globalThis.fetch;
    globalThis.fetch = Object.assign(
      async (input: URL | RequestInfo, init?: RequestInit | BunFetchRequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const fixture = bodies.get(url);
        if (fixture) {
          return new Response(fixture.body, {
            status: 200,
            headers: {
              "content-type": fixture.mimeType
            }
          });
        }
        return originalFetch(input, init);
      },
      { preconnect: originalFetch.preconnect }
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  return bodies;
}
