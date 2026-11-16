import { expect, test } from 'bun:test';
import { bugReportMarkdown, githubIssueDraft, type BugReport } from './report';

const report: BugReport = { version: 1, summary: 'Tab & draft', steps: 'Open invoice\nSplit right', expected: 'Keep the draft', context: { application: 'Books', version: 'fixture', view: 'invoice', viewport: '390 x 844', browser: 'fixture browser' }, screenshot: { name: 'screenshot.png', dataUrl: 'data:image/png;base64,PRIVATE_IMAGE' } };

test('GitHub draft roundtrips text and excludes screenshot bytes from the URL and markdown', () => {
  const draft = githubIssueDraft(report, { owner: 'hyperfocus-info', name: 'hyperfocus' });
  const url = new URL(draft.url);
  expect(url.origin).toBe('https://github.com');
  expect(url.pathname).toBe('/hyperfocus-info/hyperfocus/issues/new');
  expect(url.searchParams.get('title')).toBe('[Books] Tab & draft');
  expect(url.searchParams.get('body')).toBe(bugReportMarkdown(report));
  expect(draft.bodyOmitted).toBe(false);
  expect(bugReportMarkdown(report)).toContain('Attach the reviewed screenshot');
  expect(draft.url).not.toContain('PRIVATE_IMAGE');
  expect(bugReportMarkdown(report)).not.toContain('PRIVATE_IMAGE');
  expect(() => githubIssueDraft(report, { owner: 'other/../../', name: 'x' })).toThrow('Invalid GitHub repository');
});

test('oversized international text uses an explicit full-copy fallback without truncating the report', () => {
  const long = { ...report, steps: '\u754c'.repeat(4000) };
  const draft = githubIssueDraft(long, { owner: 'hyperfocus-info', name: 'hyperfocus' });
  expect(draft.bodyOmitted).toBe(true);
  expect(new URL(draft.url).searchParams.has('body')).toBe(false);
  expect(bugReportMarkdown(long)).toContain(long.steps);
});
