import { z } from 'zod';

const text = z.string().trim().min(1).max(600);
export const menuActions = ['match:start', 'match:practice', 'match:quick'] as const;
export const menuIntentSchema = z.object({
  surface: z.literal('tod-title-menu'),
  audience: z.enum(['new-and-returning-players', 'developers', 'other']),
  primaryGoal: text,
  secondaryGoals: z.array(text).max(5),
  capabilities: z.array(z.enum(['local-match', 'practice', 'random-ai', 'online-play', 'settings'])).min(1).max(5),
  hierarchy: z.array(text).min(1).max(5),
  inputModes: z.array(z.enum(['pointer', 'keyboard', 'controller'])).min(1).max(3),
  constraints: z.array(text).max(16),
  productContext: z.literal('Touch of Death'),
  tone: text,
  exclusions: z.array(text).max(10),
  confidence: z.enum(['high', 'medium', 'low']),
  ambiguities: z.array(z.object({ question: text, material: z.boolean() }).strict()).max(5),
}).strict();
export type MenuIntent = z.infer<typeof menuIntentSchema>;

/** Data only: models cannot change CSS, selectors, handlers, navigation, or colors. */
export const menuRecipeSchema = z.object({
  id: z.enum(['A', 'B', 'C']),
  rationale: text,
  composition: z.literal('tod-title-rail-v1'),
  layout: z.enum(['split', 'stacked', 'compact']),
  actions: z.array(z.string().min(1).max(60)).min(1).max(8),
  primaryAction: z.string().min(1).max(60),
  railWidth: z.number().int().min(300).max(480),
  gap: z.number().int().min(4).max(16),
  titleSize: z.number().int().min(64).max(148),
  mobileTitleSize: z.number().int().min(32).max(64),
  supportCopy: z.string().trim().min(1).max(160),
  shortHeight: z.enum(['inherit', 'scroll']),
}).strict();
export type MenuRecipe = z.infer<typeof menuRecipeSchema>;

export const findingSchema = z.object({
  code: text, problem: text, evidence: text,
  severity: z.enum(['blocker', 'major', 'minor']),
  repairability: z.enum(['bounded', 'requires-intent', 'unsupported']),
  learning: z.enum(['instance-defect', 'missing-validator', 'missing-composition-rule', 'missing-primitive', 'missing-taste-knowledge', 'model-failure']),
  futureValidator: z.string().max(600),
}).strict();
export type Finding = z.infer<typeof findingSchema>;
export const dimensions = ['intent', 'composition', 'hierarchy', 'domain', 'slop', 'regression'] as const;
export const criticReportSchema = z.object({
  dimension: z.enum(dimensions),
  verdict: z.enum(['strong', 'adequate', 'weak', 'uncertain']),
  evidence: text,
  findings: z.array(findingSchema).max(6),
}).strict();
export type CriticReport = z.infer<typeof criticReportSchema>;

export function defect(code: string, problem: string, evidence: string, repairability: Finding['repairability'] = 'unsupported'): Finding {
  return { code, problem, evidence, severity: 'blocker', repairability, learning: 'instance-defect', futureValidator: '' };
}
