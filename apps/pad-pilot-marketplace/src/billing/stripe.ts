import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { marketplaceEnv, type MarketplaceEnv } from "../env";
import type { BillingCheckoutKind } from "../db";
import { readBoundedStreamText } from "@hyperfocus/pad-pilot/bounded-stream";

type StripeCheckoutMode = "payment" | "subscription";
const maxStripeResponseBytes = 1048576;
const stripeResponseSchema = z.object({
  amount_total: z.unknown().optional(),
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
  id: z.string().optional(),
  url: z.string().optional(),
}).passthrough();

type StripeCheckoutInput = {
  amountCents: number;
  checkoutId: string;
  checkoutKind: BillingCheckoutKind;
  env?: MarketplaceEnv;
  moduleId?: string;
  mode: StripeCheckoutMode;
  orderId?: string;
  productName?: string;
  successUrl: string;
  cancelUrl: string;
  userId: string;
};

function stripeFetch(path: string, init: RequestInit = {}, runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  if (!runtimeEnv.stripeSecretKey) {
    throw new Error("Stripe is not configured.");
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${runtimeEnv.stripeSecretKey}`);
  return fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

function encodeForm(data: Record<string, string>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    body.set(key, value);
  }
  return body.toString();
}

function decodeStripeResponse(body: string) {
  try {
    const parsed = stripeResponseSchema.safeParse(JSON.parse(body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function readStripeResponse(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxStripeResponseBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The response size failure remains authoritative.
    }
    throw new Error("Stripe response exceeded its size limit.");
  }
  return readBoundedStreamText(response.body, {
    label: "Stripe response",
    maxBytes: maxStripeResponseBytes,
  });
}

export async function createStripeCheckoutSession(input: StripeCheckoutInput) {
  const runtimeEnv = input.env ?? marketplaceEnv;
  const currency = "usd";
  const isRecurring = input.mode === "subscription";
  const productId =
    input.checkoutKind === "first_class_start"
      ? runtimeEnv.stripeProductIdFirstClass
      : runtimeEnv.stripeProductIdPadPilotLifetime;

  const payload: Record<string, string> = {
    cancel_url: input.cancelUrl,
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][quantity]": "1",
    mode: input.mode,
    success_url: input.successUrl,
    "metadata[checkout_id]": input.checkoutId,
    "metadata[checkout_kind]": input.checkoutKind,
    "metadata[user_id]": input.userId,
  };

  if (input.checkoutKind === "module_purchase") {
    if (!input.moduleId || !input.orderId || !input.productName?.trim()) {
      throw new Error("Module Checkout is missing its product identity.");
    }
    payload["line_items[0][price_data][product_data][name]"] = input.productName.trim().slice(0, 120);
    payload["metadata[module_id]"] = input.moduleId;
    payload["metadata[order_id]"] = input.orderId;
  } else {
    payload["line_items[0][price_data][product]"] = productId;
  }

  if (isRecurring) {
    payload["line_items[0][price_data][recurring][interval]"] = "month";
    payload["subscription_data[metadata][checkout_id]"] = input.checkoutId;
    payload["subscription_data[metadata][checkout_kind]"] = input.checkoutKind;
    payload["subscription_data[metadata][user_id]"] = input.userId;
  } else {
    payload["payment_intent_data[metadata][checkout_id]"] = input.checkoutId;
    payload["payment_intent_data[metadata][checkout_kind]"] = input.checkoutKind;
    payload["payment_intent_data[metadata][user_id]"] = input.userId;
    if (input.moduleId && input.orderId) {
      payload["payment_intent_data[metadata][module_id]"] = input.moduleId;
      payload["payment_intent_data[metadata][order_id]"] = input.orderId;
    }
  }

  const response = await stripeFetch(
    "/v1/checkout/sessions",
    {
      body: encodeForm(payload),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": `padpilot-checkout-${input.checkoutId}`,
      },
      method: "POST",
    },
    runtimeEnv,
  );
  const body = await readStripeResponse(response);
  const data = decodeStripeResponse(body);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? (body || "Unable to create Stripe Checkout session."));
  }
  const sessionId = typeof data?.id === "string" && /^cs_[A-Za-z0-9_]{1,240}$/.test(data.id)
    ? data.id
    : null;
  const checkoutUrl = typeof data?.url === "string" ? data.url : "";
  let parsedCheckoutUrl: URL | null = null;
  try {
    parsedCheckoutUrl = new URL(checkoutUrl);
  } catch {
    parsedCheckoutUrl = null;
  }
  if (
    !data ||
    !sessionId ||
    parsedCheckoutUrl?.protocol !== "https:" ||
    parsedCheckoutUrl.hostname !== "checkout.stripe.com" ||
    parsedCheckoutUrl.port !== "" ||
    parsedCheckoutUrl.username !== "" ||
    parsedCheckoutUrl.password !== ""
  ) {
    throw new Error("Stripe returned an invalid checkout session response.");
  }
  const amountTotal = Number(data.amount_total ?? input.amountCents);
  if (!Number.isSafeInteger(amountTotal) || amountTotal !== input.amountCents) {
    throw new Error("Stripe returned a Checkout amount that did not match the request.");
  }

  return {
    amountTotal,
    id: sessionId,
    priceId: null,
    url: checkoutUrl,
  };
}

export async function cancelStripeSubscription(subscriptionId: string, runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  if (!/^sub_[A-Za-z0-9_]{1,240}$/.test(subscriptionId)) {
    throw new Error("Stripe returned an invalid subscription id.");
  }

  const response = await stripeFetch(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: { "idempotency-key": `padpilot-auto-cancel-${subscriptionId}` },
      method: "DELETE",
    },
    runtimeEnv,
  );
  const body = await readStripeResponse(response);
  const data = decodeStripeResponse(body);
  if (!response.ok && data?.error?.code !== "resource_missing") {
    throw new Error(data?.error?.message ?? (body || "Unable to cancel Stripe subscription."));
  }

  return {
    alreadyCanceled: !response.ok,
    id: subscriptionId,
  };
}

function verifyStripeTimestamp(timestamp: number) {
  const toleranceSeconds = 300;
  return Math.abs(Date.now() / 1000 - timestamp) <= toleranceSeconds;
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null, runtimeEnv: MarketplaceEnv = marketplaceEnv) {
  if (!runtimeEnv.stripeWebhookSecret) {
    throw new Error("Stripe webhook secret is not configured.");
  }
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature.");
  }

  const parts = signatureHeader.split(",").map((entry) => entry.trim());
  const timestampPart = parts.find((entry) => entry.startsWith("t="));
  const timestampText = timestampPart?.slice(2) ?? "";
  const timestamp = /^\d{1,20}$/.test(timestampText) ? Number(timestampText) : Number.NaN;
  const providedSignatures = parts
    .filter((entry) => entry.startsWith("v1="))
    .map((entry) => entry.slice(3))
    .filter((signature) => /^[0-9a-f]{64}$/i.test(signature));

  if (!Number.isSafeInteger(timestamp) || providedSignatures.length === 0 || !verifyStripeTimestamp(timestamp)) {
    throw new Error("Invalid Stripe signature timestamp.");
  }

  const expected = createHmac("sha256", runtimeEnv.stripeWebhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const matches = providedSignatures.some((provided) => {
    const providedBuffer = Buffer.from(provided, "hex");
    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  });
  if (!matches) {
    throw new Error("Invalid Stripe signature.");
  }
}
