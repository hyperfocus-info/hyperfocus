import type { Database } from "bun:sqlite";
import { claimBillingResourceEvent, type BillingCheckoutRow } from "../db";

const subscriptionStatuses = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;
const refundStatuses = ["pending", "requires_action", "succeeded", "failed", "canceled"] as const;

export function tokensForAmount(amountCents: number) {
  return Math.max(0, Math.floor(amountCents / 10));
}

export function asObject(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

export function readMetadata(value: unknown) {
  const object = asObject(value);
  const metadata: Record<string, string> = {};
  if (!object) return metadata;
  for (const [key, entry] of Object.entries(object)) {
    if (typeof entry === "string" && key.length <= 100 && entry.length <= 500) metadata[key] = entry;
  }
  return metadata;
}

export function readSubscriptionMetadata(eventObject: Record<string, unknown>) {
  const parent = asObject(eventObject.parent);
  const parentDetails = asObject(parent?.subscription_details);
  const subscriptionDetails = asObject(eventObject.subscription_details);
  for (const candidate of [parentDetails?.metadata, subscriptionDetails?.metadata, eventObject.metadata]) {
    const metadata = readMetadata(candidate);
    if (metadata.checkout_id || metadata.checkout_kind || metadata.user_id) return metadata;
  }
  return {};
}

export function readRequiredString(value: unknown, label: string, maxLength = 255) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`Stripe webhook has an invalid ${label}.`);
  }
  return value;
}

export function readOptionalString(value: unknown, label: string, maxLength = 255) {
  if (value === null || value === undefined || value === "") return null;
  return readRequiredString(value, label, maxLength);
}

export function readMoney(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Stripe webhook has an invalid ${label}.`);
  }
  return value;
}

export function readCreatedAt(object: Record<string, unknown>) {
  const seconds = object.created;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || seconds <= 0) {
    return new Date().toISOString();
  }
  const timestamp = new Date(seconds * 1000);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString();
}

export function readPeriodEnd(object: Record<string, unknown>) {
  const lines = asObject(object.lines);
  const lineData = Array.isArray(lines?.data) ? lines.data : [];
  const firstLine = asObject(lineData[0]);
  const period = asObject(firstLine?.period);
  for (const candidate of [object.current_period_end, object.period_end, period?.end]) {
    if (typeof candidate !== "number" || !Number.isSafeInteger(candidate) || candidate <= 0) continue;
    const timestamp = new Date(candidate * 1000);
    if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString();
  }
  return null;
}

export function readEventCreated(event: Record<string, unknown>, object: Record<string, unknown>) {
  for (const value of [event.created, object.created]) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  }
  return 0;
}

export function stripeEventPriority(eventType: string, object: Record<string, unknown> | null) {
  if (eventType === "customer.subscription.deleted") return 50;
  if (eventType === "customer.subscription.updated") {
    const status = object?.status;
    if (status === "canceled" || status === "incomplete_expired") return 50;
    if (status === "past_due" || status === "unpaid") return 30;
    return 20;
  }
  if (eventType === "invoice.paid") return 40;
  if (eventType === "invoice.payment_failed") return 30;
  return 10;
}

export function laterTimestamp(left: string | null, right: string) {
  if (!left) return right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return right;
  return leftTime >= rightTime ? left : right;
}

export function readIdReference(value: unknown, label: string) {
  if (typeof value === "string") return readOptionalString(value, label);
  const object = asObject(value);
  return object ? readOptionalString(object.id, label) : null;
}

export function readPaymentReferences(object: Record<string, unknown>) {
  const payment = asObject(object.payment);
  return {
    chargeId: readIdReference(object.charge ?? payment?.charge, "charge id"),
    invoiceId: readIdReference(object.invoice, "invoice id"),
    paymentIntentId: readIdReference(object.payment_intent ?? payment?.payment_intent, "payment intent id"),
  };
}

export function claimSubscriptionState(db: Database, input: {
  eventCreated: number;
  eventId: string;
  eventPriority: number;
  subscriptionId: string;
}) {
  return claimBillingResourceEvent(db, {
    eventCreated: input.eventCreated,
    eventId: input.eventId,
    eventPriority: input.eventPriority,
    resourceKey: `stripe:subscription:${input.subscriptionId}`,
    updatedAt: new Date().toISOString(),
  });
}

export function readCheckoutKind(value: string | undefined) {
  if (
    value === "first_class_start" || value === "module_purchase" ||
    value === "padpilot_financing_start" || value === "padpilot_lifetime_buyout" ||
    value === "padpilot_lifetime_outright"
  ) return value;
  return null;
}

export function readSubscriptionStatus(value: unknown) {
  const status = readRequiredString(value, "subscription status", 40);
  const normalized = subscriptionStatuses.find((candidate) => candidate === status);
  if (normalized) return normalized;
  throw new Error("Stripe webhook has an unsupported subscription status.");
}

export function readRefundStatus(value: unknown) {
  const status = readRequiredString(value, "refund status", 40);
  const normalized = refundStatuses.find((candidate) => candidate === status);
  if (normalized) return normalized;
  throw new Error("Stripe webhook has an unsupported refund status.");
}

export function requireMatchingMetadata(metadata: Record<string, string>, checkout: BillingCheckoutRow) {
  if (metadata.checkout_id && metadata.checkout_id !== checkout.id) {
    throw new Error("Stripe checkout metadata does not match the recorded checkout.");
  }
  if (metadata.user_id && metadata.user_id !== checkout.user_id) {
    throw new Error("Stripe checkout user does not match the recorded checkout.");
  }
  const metadataKind = metadata.checkout_kind ? readCheckoutKind(metadata.checkout_kind) : null;
  if (metadata.checkout_kind && metadataKind !== checkout.checkout_kind) {
    throw new Error("Stripe checkout kind does not match the recorded checkout.");
  }
  if (metadata.order_id && metadata.order_id !== checkout.order_id) {
    throw new Error("Stripe checkout order does not match the recorded checkout.");
  }
}

export function requireCheckoutPayment(
  object: Record<string, unknown>,
  checkout: BillingCheckoutRow,
  allowPending: boolean,
) {
  const amountTotal = readMoney(object.amount_total, "checkout amount");
  const currency = readRequiredString(object.currency, "checkout currency", 10).toLowerCase();
  const paymentStatus = readRequiredString(object.payment_status, "checkout payment status", 40);
  if (amountTotal !== checkout.amount_cents_snapshot || currency !== checkout.currency.toLowerCase()) {
    throw new Error("Stripe checkout payment does not match the recorded price.");
  }
  if (allowPending && paymentStatus === "unpaid") return null;
  if (paymentStatus !== "paid" && !(paymentStatus === "no_payment_required" && amountTotal === 0)) {
    throw new Error("Stripe checkout is not paid.");
  }
  return amountTotal;
}

export function requireInvoicePayment(
  object: Record<string, unknown>,
  expectedAmount: number,
  expectedCurrency: string,
) {
  const amountPaid = readMoney(object.amount_paid, "invoice amount");
  const currency = readRequiredString(object.currency, "invoice currency", 10).toLowerCase();
  if (amountPaid !== expectedAmount || currency !== expectedCurrency.toLowerCase() || amountPaid <= 0) {
    throw new Error("Stripe invoice payment does not match the recorded subscription price.");
  }
  return amountPaid;
}
