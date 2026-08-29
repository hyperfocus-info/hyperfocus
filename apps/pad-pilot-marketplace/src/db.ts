export { compareVersions, nowIso, sha256 } from "./db-core";

export type SubscriptionStatus =
  | "active_financing"
  | "canceled"
  | "first_class_active"
  | "free"
  | "guest"
  | "lifetime"
  | "lifetime_and_first_class"
  | "past_due";

export type PadPilotAccessStatus = "canceled" | "financing" | "free" | "lifetime" | "past_due";
export type FirstClassMembershipStatus = "active" | "canceled" | "past_due";
export type BillingCheckoutKind =
  | "first_class_start"
  | "module_purchase"
  | "padpilot_financing_start"
  | "padpilot_lifetime_buyout"
  | "padpilot_lifetime_outright";
export type TokenSourceKind =
  | "first_class_monthly"
  | "lifetime_buyout"
  | "lifetime_purchase"
  | "manual_adjustment"
  | "refund_reversal"
  | "spend";

/** Row shape for users table. */
export type UserRow = {
  id: string;
  clerk_user_id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  subscription_status: SubscriptionStatus;
  pilot_token_balance: number;
};

/** Row shape for modules table with owner username/display_name joined. */
export type ModuleRow = {
  id: string;
  owner_user_id: string;
  slug: string;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  visibility: string;
  created_at: string;
  updated_at: string;
  username: string | null;
  display_name: string | null;
};

/** Row shape for module_versions table. */
export type VersionRow = {
  id: string;
  version: string;
  bundle_path: string;
  checksum_sha256: string;
  file_size_bytes: number;
  status: string;
  created_at: string;
  published_at: string | null;
};

export type SessionRow = {
  expires_at: string;
  token_hash: string;
  user_id: string;
};

export type PadPilotAccessRow = {
  id: string;
  user_id: string;
  status: PadPilotAccessStatus;
  lifetime_price_cents: number;
  amount_paid_cents: number;
  remaining_balance_cents: number;
  billing_anchor_at: string | null;
  last_successful_payment_at: string | null;
  next_billing_at: string | null;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FirstClassMembershipRow = {
  id: string;
  user_id: string;
  status: FirstClassMembershipStatus;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  billing_anchor_at: string | null;
  last_successful_payment_at: string | null;
  next_billing_at: string | null;
  discount_percent: number;
  created_at: string;
  updated_at: string;
};

export type BillingCheckoutRow = {
  id: string;
  user_id: string;
  checkout_kind: BillingCheckoutKind;
  stripe_checkout_session_id: string | null;
  stripe_price_id: string | null;
  amount_cents_snapshot: number;
  currency: string;
  order_id: string | null;
  scope_key: string | null;
  status: string;
  created_at: string;
  stripe_checkout_url: string | null;
  updated_at: string;
};

export type OrderRow = {
  amount_cents: number;
  created_at: string;
  currency: string;
  id: string;
  module_id: string;
  provider: string;
  provider_checkout_session_id: string | null;
  provider_payment_intent_id: string | null;
  status: string;
  updated_at: string;
  user_id: string;
};

export type BillingPaymentRow = {
  access_delta_cents: number;
  amount_cents: number;
  created_at: string;
  currency: string;
  id: string;
  order_id: string | null;
  payment_kind: string;
  provider: string;
  provider_charge_id: string | null;
  provider_checkout_session_id: string | null;
  provider_invoice_id: string | null;
  provider_payment_id: string;
  provider_payment_intent_id: string | null;
  provider_subscription_id: string | null;
  refunded_cents: number;
  reversed_access_cents: number;
  reversed_tokens: number;
  token_delta: number;
  updated_at: string;
  user_id: string;
};

export type PilotTokenLedgerRow = {
  id: string;
  user_id: string;
  source_kind: TokenSourceKind;
  source_ref: string;
  delta_tokens: number;
  balance_after: number;
  created_at: string;
  notes_json: string;
};

export type PluginReleaseChannel = "beta" | "stable";
export type PluginReleaseArtifactKind = "directory_patch" | "full_bundle";

export type PluginReleaseRow = {
  id: string;
  channel: PluginReleaseChannel;
  version: string;
  platform: string;
  arch: string;
  file_path: string;
  checksum_sha256: string;
  file_size_bytes: number;
  published_at: string;
  release_notes: string;
  artifact_kind: PluginReleaseArtifactKind;
  artifact_path: string;
  artifact_checksum_sha256: string;
  artifact_size_bytes: number;
  manifest_path: string;
  manifest_checksum_sha256: string;
  base_version_min: string | null;
  base_version_max: string | null;
  signature: string;
};

/** Module row with latest published version subquery fields. */
export type ModuleListRow = ModuleRow & {
  latest_published_version: string | null;
  latest_published_at: string | null;
  latest_file_size_bytes: number | null;
};

export type AccountSnapshot = {
  firstClass: FirstClassMembershipRow | null;
  padpilotAccess: PadPilotAccessRow | null;
  subscriptionStatus: SubscriptionStatus;
  tokenBalance: number;
  user: UserRow | null;
};

export * from "./db-bootstrap";

export * from "./db-account";
export * from "./db-billing";
export * from "./db-modules";
