import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  createMarketplaceCheckoutSession,
  deleteMarketplaceModule,
  resolveMarketplaceDownloadUrl,
} from "./api";

const originalFetch = globalThis.fetch;
const pricing = {
  firstClassDiscountPercent: 20,
  padpilotFinancingMonthlyPriceCents: 1000,
  padpilotLifetimePriceCents: 6000,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("createMarketplaceCheckoutSession", () => {
  it("surfaces plain-text API failures without crashing JSON parsing", async () => {
    globalThis.fetch = Object.assign(mock(async () =>
      new Response("You may only specify one of these parameters: product, product_data.", {
        status: 400,
      })), { preconnect: globalThis.fetch.preconnect });

    await expect(createMarketplaceCheckoutSession("padpilot_lifetime_outright"))
      .rejects
      .toThrow("You may only specify one of these parameters: product, product_data.");
  });

  it("binds paid-module checkout to the selected module id", async () => {
    let requestBody = "";
    globalThis.fetch = Object.assign(mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        amountCents: 1200,
        checkoutId: "checkout-1",
        checkoutUrl: "https://checkout.stripe.test/session",
        pricing,
      }));
    }), { preconnect: globalThis.fetch.preconnect });

    await createMarketplaceCheckoutSession("module_purchase", "module-1");

    expect(JSON.parse(requestBody)).toEqual({ checkoutKind: "module_purchase", moduleId: "module-1" });
  });

  it("rejects unsafe checkout redirect schemes", async () => {
    globalThis.fetch = Object.assign(mock(async () => new Response(JSON.stringify({
      amountCents: 1200,
      checkoutId: "checkout-1",
      checkoutUrl: "javascript:alert(1)",
      pricing,
    }))), { preconnect: globalThis.fetch.preconnect });

    await expect(createMarketplaceCheckoutSession("module_purchase", "module-1"))
      .rejects
      .toThrow("Checkout returned an unsafe redirect URL.");
  });

  it("rejects oversized marketplace JSON before buffering it", async () => {
    globalThis.fetch = Object.assign(mock(async () => new Response("", {
      headers: { "content-length": String(2097153) },
    })), { preconnect: globalThis.fetch.preconnect });

    await expect(createMarketplaceCheckoutSession("module_purchase", "module-1"))
      .rejects
      .toThrow("Marketplace response exceeded the 2 MiB limit.");
  });

  it("cancels and unlocks excessively fragmented response streams", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
      pull(controller) {
        controller.enqueue(Uint8Array.of(0x20));
      },
    });
    globalThis.fetch = Object.assign(mock(async () => new Response(stream)), { preconnect: globalThis.fetch.preconnect });

    await expect(createMarketplaceCheckoutSession("module_purchase", "module-1"))
      .rejects
      .toThrow("Marketplace response was split into too many chunks.");
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });

  it("fails closed on malformed or empty successful JSON responses", async () => {
    globalThis.fetch = Object.assign(mock(async () => new Response("not-json")), { preconnect: globalThis.fetch.preconnect });
    await expect(createMarketplaceCheckoutSession("module_purchase", "module-1"))
      .rejects
      .toThrow("Marketplace returned malformed JSON.");

    globalThis.fetch = Object.assign(mock(async () => new Response("   ")), { preconnect: globalThis.fetch.preconnect });
    await expect(createMarketplaceCheckoutSession("module_purchase", "module-1"))
      .rejects
      .toThrow("Marketplace returned an empty JSON response.");
  });

  it("rejects successful JSON with a malformed endpoint payload", async () => {
    globalThis.fetch = Object.assign(mock(async () => new Response(JSON.stringify({ checkoutUrl: 42 }))), { preconnect: globalThis.fetch.preconnect });

    await expect(createMarketplaceCheckoutSession("padpilot_lifetime_outright"))
      .rejects
      .toThrow("Marketplace returned an invalid response.");
  });

  it("deletes abandoned draft modules through the owner rollback endpoint", async () => {
    let method = "";
    let url = "";
    globalThis.fetch = Object.assign(mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      method = init?.method ?? "";
      url = input.toString();
      return new Response(JSON.stringify({ ok: true }));
    }), { preconnect: globalThis.fetch.preconnect });

    await deleteMarketplaceModule("draft-1");

    expect(method).toBe("DELETE");
    expect(new URL(url).pathname).toBe("/api/modules/draft-1");
  });

  it("keeps module and update resources on the configured marketplace origin", () => {
    expect(() => resolveMarketplaceDownloadUrl("https://attacker.test/bundle.zip"))
      .toThrow("Marketplace returned an unsafe resource URL.");
    expect(new URL(resolveMarketplaceDownloadUrl("/api/modules/module-1/download")).pathname)
      .toBe("/api/modules/module-1/download");
  });
});
