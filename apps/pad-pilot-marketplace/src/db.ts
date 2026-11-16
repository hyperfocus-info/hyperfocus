import type { z } from "zod";
import type { SubscriptionStatusSchema, PadPilotAccessStatusSchema, FirstClassMembershipStatusSchema, BillingCheckoutKindSchema, TokenSourceKindSchema, UserRowSchema, ModuleRowSchema, VersionRowSchema, SessionRowSchema, PadPilotAccessRowSchema, FirstClassMembershipRowSchema, BillingCheckoutRowSchema, OrderRowSchema, BillingPaymentRowSchema, PilotTokenLedgerRowSchema, PluginReleaseChannelSchema, PluginReleaseArtifactKindSchema, PluginReleaseRowSchema, ModuleListRowSchema } from "./storage/row-schemas";
export { compareVersions, nowIso, sha256 } from "./db-core";

export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export type PadPilotAccessStatus = z.infer<typeof PadPilotAccessStatusSchema>;
export type FirstClassMembershipStatus = z.infer<typeof FirstClassMembershipStatusSchema>;
export type BillingCheckoutKind = z.infer<typeof BillingCheckoutKindSchema>;
export type TokenSourceKind = z.infer<typeof TokenSourceKindSchema>;

/** Row shape for users table. */
export type UserRow = z.infer<typeof UserRowSchema>;

/** Row shape for modules table with owner username/display_name joined. */
export type ModuleRow = z.infer<typeof ModuleRowSchema>;

/** Row shape for module_versions table. */
export type VersionRow = z.infer<typeof VersionRowSchema>;

export type SessionRow = z.infer<typeof SessionRowSchema>;

export type PadPilotAccessRow = z.infer<typeof PadPilotAccessRowSchema>;

export type FirstClassMembershipRow = z.infer<typeof FirstClassMembershipRowSchema>;

export type BillingCheckoutRow = z.infer<typeof BillingCheckoutRowSchema>;

export type OrderRow = z.infer<typeof OrderRowSchema>;

export type BillingPaymentRow = z.infer<typeof BillingPaymentRowSchema>;

export type PilotTokenLedgerRow = z.infer<typeof PilotTokenLedgerRowSchema>;

export type PluginReleaseChannel = z.infer<typeof PluginReleaseChannelSchema>;
export type PluginReleaseArtifactKind = z.infer<typeof PluginReleaseArtifactKindSchema>;

export type PluginReleaseRow = z.infer<typeof PluginReleaseRowSchema>;

/** Module row with latest published version subquery fields. */
export type ModuleListRow = z.infer<typeof ModuleListRowSchema>;

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
