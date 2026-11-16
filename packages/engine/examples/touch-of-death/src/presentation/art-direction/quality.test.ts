import { expect, test } from 'bun:test';
import { criticNames, qualityFailures, type QualityRecord } from './quality.ts';

const hash = 'a'.repeat(64), ref = { path: 'render.png', sha256: hash };
function candidate(): QualityRecord {
  return { id: 'player', version: 'v1', contentHash: hash, domain: 'character', stage: 'CANDIDATE',
    evidence: Object.fromEntries(['front', 'three-quarter', 'side', 'gameplay', 'silhouette'].map(key => [key, ref])),
    checks: [{ name: 'render', passed: true, evidence: ref }], critics: [], accepted: {}, unresolved: ['head'], reopens: [] };
}
test('a render and passing QA cannot manufacture approval or a golden', () => {
  const record = candidate();
  expect(qualityFailures({ record })).toEqual([]);
  record.stage = 'GOLDEN';
  expect(qualityFailures({ record })).toContain('Current bytes lack owner approval');
  expect(qualityFailures({ record })).toContain('Owner has not designated this version as a reference');
  expect(qualityFailures({ record })).toContain('Golden has unresolved qualities');
});
test('animation promotion requires all three clips and its frame strip', () => {
  const record = candidate(); record.domain = 'animation';
  expect(qualityFailures({ record })).toContain('Missing contact-clip evidence');
  expect(qualityFailures({ record })).toContain('Missing neutral-clip evidence');
});
test('selection is distinct from approval; revisions preserve locks and exact bytes', () => {
  const record = candidate(); record.stage = 'APPROVED'; record.accepted = { silhouette: 'A' };
  record.owner = { contentHash: hash, source: 'owner response', date: '2026-10-04', verdict: 'select', accepted: { silhouette: 'A' } };
  record.critics = criticNames.map(name => ({ name, evidence: ref, findings: [] }));
  expect(qualityFailures({ record })).toContain('Current bytes lack owner approval');
  record.owner.verdict = 'approve';
  expect(qualityFailures({ record })).toEqual([]);
  const revised = structuredClone(record); revised.contentHash = 'b'.repeat(64); revised.accepted.silhouette = 'B';
  const failures = qualityFailures({ record: revised, previous: record });
  expect(failures).toContain('Changed bytes require a new version');
  expect(failures).toContain('Locked silhouette changed without an explicit reopen source');
  expect(failures).toContain('Current bytes lack owner approval');
});
