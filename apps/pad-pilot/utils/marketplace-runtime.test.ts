import { afterEach, describe, expect, it } from "bun:test";

import {
  resolveMarketplaceHttpBaseUrl,
  resolveMarketplaceWebSocketUrl,
} from "./marketplace-runtime";

const originalHandshake = process.env.HANDSHAKE_DETAILS;

afterEach(() => {
  if (originalHandshake === undefined) {
    delete process.env.HANDSHAKE_DETAILS;
  } else {
    process.env.HANDSHAKE_DETAILS = originalHandshake;
  }
});

describe("marketplace runtime configuration", () => {
  it("uses validated HTTP configuration for HTTP and WebSocket clients", () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({
      MARKETPLACE_URL: "https://marketplace.example",
      version: 1,
    });

    expect(resolveMarketplaceHttpBaseUrl()).toBe("https://marketplace.example/");
    expect(resolveMarketplaceWebSocketUrl()).toBe("wss://marketplace.example/");
  });

  it("fails closed to localhost for malformed or non-HTTP configuration", () => {
    process.env.HANDSHAKE_DETAILS = JSON.stringify({
      MARKETPLACE_URL: "javascript:alert(1)",
      version: "1",
    });

    expect(resolveMarketplaceHttpBaseUrl()).toBe("http://localhost:3000/");
    expect(resolveMarketplaceWebSocketUrl()).toBe("ws://localhost:3000/");
  });
});
