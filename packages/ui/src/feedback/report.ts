export type BugReportContext = { application: string; version: string; view: string; viewport: string; browser: string };
export type BugReportScreenshot = { name: string; dataUrl: string };
export type BugReport = { version: 1; summary: string; steps: string; expected: string; context: BugReportContext; screenshot?: BugReportScreenshot };

export function bugReportMarkdown(report: BugReport) {
  return `${report.summary}\n\n## Steps to reproduce\n${report.steps}\n\n## Expected behavior\n${report.expected}\n\n## Context\n${Object.entries(report.context).map(([key, value]) => `- ${key}: ${value.replaceAll('\n', ' ')}`).join('\n')}${report.screenshot ? `\n\n## Screenshot\nAttach the reviewed screenshot here before submitting.` : ''}`;
}

/** GitHub draft URLs cannot carry attachments. Large reports use an explicit copy/paste fallback. */
export function githubIssueDraft(report: BugReport, repository: { owner: string; name: string }) {
  if (!/^[\w-]+$/.test(repository.owner) || !/^[\w.-]+$/.test(repository.name)) throw new Error('Invalid GitHub repository.');
  const url = new URL(`https://github.com/${repository.owner}/${repository.name}/issues/new`);
  url.searchParams.set('title', `[${report.context.application}] ${report.summary}`);
  url.searchParams.set('body', bugReportMarkdown(report));
  const bodyOmitted = url.href.length > 7000;
  if (bodyOmitted) url.searchParams.delete('body');
  return { url: url.href, bodyOmitted };
}
