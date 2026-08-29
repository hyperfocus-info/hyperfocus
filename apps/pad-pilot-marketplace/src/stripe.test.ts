import { afterEach, describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import {
  cancelStripeSubscription,
  createStripeCheckoutSession,
  verifyStripeWebhookSignature,
} from "./stripe";
import { loadMarketplaceEnv } from "./env";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createEnv() {
  return {
    ...loadMarketplaceEnv(),
    stripeProductIdFirstClass: "prod_first_class",
    stripeProductIdPadPilotLifetime: "prod_padpilot_lifetime",
    stripeSecretKey: "sk_test_123",
  };
}

describe("createStripeCheckoutSession", () => {
  it("does not send product_data when using a Stripe product id", async () => {
    const fetchSpy = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? "");

      expect(body).toContain("line_items%5B0%5D%5Bprice_data%5D%5Bproduct%5D=prod_padpilot_lifetime");
      expect(body).not.toContain("product_data");

      return new Response(JSON.stringify({
        amount_total: 6000,
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
      }));
    });

    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const session = await createStripeCheckoutSession({
      amountCents: 6000,
      cancelUrl: "http://localhost:3000/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "padpilot_lifetime_outright",
      env: createEnv(),
      mode: "payment",
      successUrl: "http://localhost:3000/?checkout=success",
      userId: "user_123",
    });

    expect(session.id).toBe("cs_test_123");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("surfaces plain-text Stripe failures as a normal error message", async () => {
    globalThis.fetch = mock(async () =>
      new Response("You may only specify one of these parameters: product, product_data.", {
        status: 400,
      })) as unknown as typeof fetch;

    await expect(createStripeCheckoutSession({
      amountCents: 6000,
      cancelUrl: "http://localhost:3000/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "padpilot_lifetime_outright",
      env: createEnv(),
      mode: "payment",
      successUrl: "http://localhost:3000/?checkout=success",
      userId: "user_123",
    })).rejects.toThrow("You may only specify one of these parameters: product, product_data.");
  });

  it("rejects an arbitrary HTTPS host in a Stripe Checkout response", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      amount_total: 6000,
      id: "cs_test_123",
      url: "https://attacker.test/checkout/cs_test_123",
    }))) as unknown as typeof fetch;

    await expect(createStripeCheckoutSession({
      amountCents: 6000,
      cancelUrl: "http://localhost:3000/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "padpilot_lifetime_outright",
      env: createEnv(),
      mode: "payment",
      successUrl: "http://localhost:3000/?checkout=success",
      userId: "user_123",
    })).rejects.toThrow("Stripe returned an invalid checkout session response.");
  });

  it("rejects oversized Stripe responses before buffering them", async () => {
    globalThis.fetch = mock(async () =>
      new Response("oversized", {
        headers: { "content-length": `${1024 * 1024 + 1}` },
      })) as unknown as typeof fetch;

    await expect(createStripeCheckoutSession({
      amountCents: 6000,
      cancelUrl: "http://localhost:3000/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "padpilot_lifetime_outright",
      env: createEnv(),
      mode: "payment",
      successUrl: "http://localhost:3000/?checkout=success",
      userId: "user_123",
    })).rejects.toThrow("Stripe response exceeded its size limit.");
  });

  it("copies PadPilot identity metadata onto recurring subscriptions", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("subscription_data%5Bmetadata%5D%5Bcheckout_id%5D=checkout_123");
      expect(body).toContain("subscription_data%5Bmetadata%5D%5Bcheckout_kind%5D=first_class_start");
      expect(body).toContain("subscription_data%5Bmetadata%5D%5Buser_id%5D=user_123");
      return new Response(JSON.stringify({ amount_total: 1000, id: "cs_recurring", url: "https://checkout.stripe.com/c/pay/cs_recurring" }));
    }) as unknown as typeof fetch;

    await createStripeCheckoutSession({
      amountCents: 1000,
      cancelUrl: "https://marketplace.test/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "first_class_start",
      env: createEnv(),
      mode: "subscription",
      successUrl: "https://marketplace.test/?checkout=success",
      userId: "user_123",
    });
  });

  it("uses dynamic product data and payment metadata for module purchases", async () => {
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      const headers = new Headers(init?.headers);
      expect(body).toContain("product_data%5D%5Bname%5D=Magic+Module");
      expect(body).toContain("payment_intent_data%5Bmetadata%5D%5Border_id%5D=order_123");
      expect(body).not.toContain("price_data%5D%5Bproduct%5D=");
      expect(headers.get("idempotency-key")).toBe("padpilot-checkout-checkout_123");
      return new Response(JSON.stringify({
        amount_total: 1200,
        id: "cs_module_purchase",
        url: "https://checkout.stripe.com/c/pay/cs_module_purchase",
      }));
    }) as unknown as typeof fetch;

    await createStripeCheckoutSession({
      amountCents: 1200,
      cancelUrl: "https://marketplace.test/?checkout=cancelled",
      checkoutId: "checkout_123",
      checkoutKind: "module_purchase",
      env: createEnv(),
      mode: "payment",
      moduleId: "module_123",
      orderId: "order_123",
      productName: "Magic Module",
      successUrl: "https://marketplace.test/?checkout=success",
      userId: "user_123",
    });
  });

  it("cancels a financing subscription with an authenticated Stripe request", async () => {
    const fetchSpy = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.stripe.com/v1/subscriptions/sub_financing_123");
      expect(init?.method).toBe("DELETE");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer sk_test_123");
      expect(headers.get("idempotency-key")).toBe("padpilot-auto-cancel-sub_financing_123");
      return new Response(JSON.stringify({ id: "sub_financing_123", status: "canceled" }));
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(cancelStripeSubscription("sub_financing_123", createEnv())).resolves.toEqual({
      alreadyCanceled: false,
      id: "sub_financing_123",
    });
  });
});

describe("verifyStripeWebhookSignature", () => {
  it("accepts any matching v1 signature during Stripe secret rotation", () => {
    const payload = JSON.stringify({ id: "evt_rotation" });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = "whsec_rotation_fixture";
    const valid = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const runtimeEnv = { ...createEnv(), stripeWebhookSecret: secret };

    expect(() => verifyStripeWebhookSignature(
      payload,
      `t=${timestamp},v1=${"0".repeat(64)},v1=${valid}`,
      runtimeEnv,
    )).not.toThrow();
  });
});
