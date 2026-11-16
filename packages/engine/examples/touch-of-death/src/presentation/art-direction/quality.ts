import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.object({ path: z.string().min(1), sha256: digest }).strict();
export const criticNames = ['silhouette', 'character-design', 'animation', 'composition', 'material', 'lighting', 'slop'] as const;
export const qualityRecordSchema = z.object({
  id: z.string().min(1), version: z.string().min(1), contentHash: digest,
  domain: z.enum(['character', 'animation', 'arena', 'impact', 'slice']),
  stage: z.enum(['ROUGH', 'CANDIDATE', 'APPROVED', 'GOLDEN']),
  evidence: z.record(z.string(), reference),
  checks: z.array(z.object({ name: z.string().min(1), passed: z.boolean(), evidence: reference }).strict()),
  critics: z.array(z.object({ name: z.enum(criticNames), evidence: reference, findings: z.array(z.object({ severity: z.enum(['blocker', 'repair', 'note']), observation: z.string().min(1), cause: z.string().min(1), action: z.string().min(1) }).strict()) }).strict()),
  accepted: z.record(z.string(), z.string().min(1)), unresolved: z.array(z.string().min(1)),
  owner: z.object({ contentHash: digest, source: z.string().min(1), date: z.string().date(), verdict: z.enum(['select', 'approve', 'golden']), accepted: z.record(z.string(), z.string().min(1)) }).strict().optional(),
  reopens: z.array(z.object({ field: z.string().min(1), source: z.string().min(1) }).strict()).default([]),
}).strict();

export type QualityRecord = z.infer<typeof qualityRecordSchema>;
const requiredEvidence = {
  character: ['front', 'three-quarter', 'side', 'gameplay', 'silhouette'],
  animation: ['neutral-clip', 'gameplay-clip', 'contact-clip', 'frame-strip'],
  arena: ['blockout-a', 'blockout-b', 'blockout-c', 'gameplay', 'obstruction-sweep'],
  impact: ['no-effects-contact', 'light-contact', 'heavy-contact', 'reduced-motion'],
  slice: ['before', 'after', 'idle', 'locomotion', 'light', 'heavy', 'hit-reaction', 'hud', 'audio-sync'],
} as const;

/** Evidence completeness is deterministic; the owner's taste verdict is not inferred. */
export function qualityFailures(options: { record: QualityRecord; previous?: QualityRecord }) {
  const record = qualityRecordSchema.parse(options.record), previous = options.previous;
  const failures: string[] = [];
  const rank = { ROUGH: 0, CANDIDATE: 1, APPROVED: 2, GOLDEN: 3 };
  if (rank[record.stage] >= 1) {
    for (const key of requiredEvidence[record.domain]) if (!record.evidence[key]) failures.push(`Missing ${key} evidence`);
    if (!record.checks.length || record.checks.some(check => !check.passed)) failures.push('Objective checks missing or failing');
  }
  if (rank[record.stage] >= 2) {
    for (const name of criticNames) if (!record.critics.some(critic => critic.name === name)) failures.push(`Missing ${name} critic (use an evidenced not-applicable finding when outside scope)`);
    if (record.critics.some(critic => critic.findings.some(finding => finding.severity !== 'note'))) failures.push('Unresolved visual blocker or repair');
    if (!record.owner || record.owner.contentHash !== record.contentHash || record.owner.verdict === 'select') failures.push('Current bytes lack owner approval');
    for (const [field, value] of Object.entries(record.accepted)) if (record.owner?.accepted[field] !== value) failures.push(`Accepted ${field} lacks matching owner evidence`);
  }
  if (record.stage === 'GOLDEN') {
    if (record.owner?.verdict !== 'golden') failures.push('Owner has not designated this version as a reference');
    if (record.unresolved.length) failures.push('Golden has unresolved qualities');
  }
  if (previous) {
    if (previous.id !== record.id || previous.domain !== record.domain) failures.push('Revision changed asset identity or domain');
    if (previous.contentHash !== record.contentHash && previous.version === record.version) failures.push('Changed bytes require a new version');
    for (const [field, value] of Object.entries(previous.accepted)) {
      if (record.accepted[field] !== value && !record.reopens.some(reopen => reopen.field === field)) failures.push(`Locked ${field} changed without an explicit reopen source`);
    }
  }
  return failures;
}
