import { z } from 'zod';

export const approvalModeSchema = z.enum(['user-validation', 'text-validation', 'automatically-approve']);
export const timeZoneSchema = z.string().min(1).max(80).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid IANA time zone.');
export const approvalPolicySchema = z.object({ mode: approvalModeSchema.default('user-validation'), timeZone: timeZoneSchema.default('UTC'), mutedUntil: z.string().datetime().optional() }).strict();
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export const notificationsMuted = (policy: ApprovalPolicy, now = Date.now()) => Boolean(policy.mutedUntil && Date.parse(policy.mutedUntil) > now);

/** A channel preference never grants new domain authority or bypasses a risk check. */
export function approvalRoute(policy: ApprovalPolicy, options: { automaticEligible: boolean; confirmationRequired: boolean; now?: number }): 'app' | 'text' | 'automatic' | 'muted' {
  if (policy.mode === 'automatically-approve' && options.automaticEligible && !options.confirmationRequired) return 'automatic';
  if (notificationsMuted(policy, options.now)) return 'muted';
  return policy.mode === 'user-validation' ? 'app' : 'text';
}
