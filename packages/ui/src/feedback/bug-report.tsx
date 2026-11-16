import * as stylex from '@stylexjs/stylex';
import { createMemo, createSignal, onCleanup, Show } from 'solid-js';
import { Button } from '../primitives/button';
import { Dialog } from '../primitives/dialog';
import { FormField } from '../form/form';
import { Input, FileInput } from '../form/input';
import { tokens } from '../theme/tokens.stylex';
import { captureReportScreenshot, readReportScreenshot } from './screenshot';
import { bugReportMarkdown, githubIssueDraft, type BugReport, type BugReportContext, type BugReportScreenshot } from './report';

const styles = stylex.create({
  stack: { gap: tokens.space3, display: 'flex', flexDirection: 'column', minWidth: 0, },
  row: { gap: tokens.space2, alignItems: 'center', display: 'flex', flexWrap: 'wrap', },
  text: { padding: tokens.space2, borderColor: tokens.border, borderRadius: tokens.radiusSmall, borderStyle: 'solid', borderWidth: 1, backgroundColor: tokens.panel, boxSizing: 'border-box', color: tokens.foreground, fontFamily: tokens.fontUi, fontSize: tokens.fontBody, fontWeight: 400, resize: 'vertical', minHeight: '4rem', width: '100%', },
  preview: { display: 'block', objectFit: 'contain', maxHeight: '10rem', maxWidth: '100%', },
  muted: { margin: 0, color: tokens.muted, fontSize: tokens.fontCaption, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', },
  error: { color: tokens.danger },
});

/** Each opening owns a fresh report. Context is frozen before review; closing cancels pending UI updates. */
export function BugReportDialog(props: { open: boolean; onClose: () => void; context: BugReportContext; repository: { owner: string; name: string } }) {
  return <Show when={props.open}>{opened => {
  if (!opened()) return null;
  const context = { ...props.context }, repository = { ...props.repository };
  const [summary, setSummary] = createSignal(''), [steps, setSteps] = createSignal(''), [expected, setExpected] = createSignal('');
  const [screenshot, setScreenshot] = createSignal<BugReportScreenshot>(), [reviewed, setReviewed] = createSignal(false);
  const [capturingScreen, setCapturingScreen] = createSignal(false);
  const [busy, setBusy] = createSignal(false), [error, setError] = createSignal(''), [status, setStatus] = createSignal('');
  let alive = true; onCleanup(() => { alive = false; });
  const report = createMemo<BugReport>(() => ({ version: 1, summary: summary().trim(), steps: steps().trim(), expected: expected().trim(), context, screenshot: screenshot() }));
  const draft = createMemo(() => githubIssueDraft(report(), repository));
  const textDownload = createMemo(() => `data:text/markdown;charset=utf-8,${encodeURIComponent(bugReportMarkdown(report()))}`);
  const capture = async (work: () => Promise<BugReportScreenshot>) => {
    setBusy(true); setError('');
    try { const image = await work(); if (alive) { setScreenshot(image); setReviewed(false); } }
    catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : 'Screenshot unavailable.'); }
    finally { if (alive) setBusy(false); }
  };
  return <Dialog open={!capturingScreen()} onClose={props.onClose} title="Report a bug"><form aria-label="Bug report" {...stylex.attrs(styles.stack)} onSubmit={event => {
    event.preventDefault(); if (busy() || !reviewed() || !report().summary || !report().steps) return;
    window.open(draft().url, '_blank', 'noopener,noreferrer');
    setStatus('Continue in the GitHub draft. Nothing has been submitted yet.');
  }}>
    <FormField label="What went wrong?"><Input required maxlength={160} value={summary()} onInput={event => { setSummary(event.currentTarget.value); setReviewed(false); }}/></FormField>
    <FormField label="Steps to reproduce"><textarea {...stylex.attrs(styles.text)} required maxlength={4000} rows={3} value={steps()} onInput={event => { setSteps(event.currentTarget.value); setReviewed(false); }}/></FormField>
    <FormField label="What did you expect?"><textarea {...stylex.attrs(styles.text)} maxlength={2000} rows={2} value={expected()} onInput={event => { setExpected(event.currentTarget.value); setReviewed(false); }}/></FormField>
    <details><summary>Included context</summary><pre {...stylex.attrs(styles.muted)}>{JSON.stringify(context, null, 2)}</pre></details>
    <div {...stylex.attrs(styles.row)}><Button variant="secondary" size="small" tooltip="Choose a screen or window and capture one frame" disabled={busy()} onClick={() => { setCapturingScreen(true); void capture(captureReportScreenshot).finally(() => { if (alive) setCapturingScreen(false); }); }}>Capture screenshot</Button><FileInput aria-label="Attach screenshot" accept="image/png,image/jpeg,image/webp" disabled={busy()} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void capture(() => readReportScreenshot(file)); event.currentTarget.value = ''; }}/></div>
    <Show when={screenshot()}>{image => <div {...stylex.attrs(styles.stack)}><img src={image().dataUrl} alt="Screenshot to include in this report" {...stylex.attrs(styles.preview)}/><div {...stylex.attrs(styles.row)}><a href={image().dataUrl} download={image().name}>Download screenshot</a><Button variant="ghost" size="small" tooltip="Remove the screenshot from this report" onClick={() => { setScreenshot(undefined); setReviewed(false); }}>Remove screenshot</Button></div><p {...stylex.attrs(styles.muted)}>Download this image, then attach it to the GitHub draft. Screenshots are not attached automatically.</p></div>}</Show>
    <label {...stylex.attrs(styles.row)}><input type="checkbox" checked={reviewed()} onChange={event => setReviewed(event.currentTarget.checked)}/>I reviewed the report and screenshot for private information.</label>
    <p {...stylex.attrs(styles.muted)}>GitHub reports are visible to everyone with access to {repository.owner}/{repository.name}. Only what you enter and the listed context are included. App records and account details are not collected automatically.</p>
    <Show when={draft().bodyOmitted}><p role="status">This report is too long for a draft link. Copy the report and paste it into the GitHub description.</p></Show>
    <div {...stylex.attrs(styles.row)}><Button type="submit" variant="primary" tooltip="Review and submit on GitHub" disabled={!reviewed() || busy()}>Open GitHub draft</Button><Button variant="secondary" tooltip="Copy the complete report text" onClick={async () => {
      try { await navigator.clipboard.writeText(bugReportMarkdown(report())); if (alive) setStatus('Report copied. Paste it into the GitHub description.'); }
      catch { if (alive) setError('Copy is unavailable. Download the report instead.'); }
    }}>Copy report</Button><a href={textDownload()} download="bug-report.md">Download report</a></div>
    <Show when={status()}><p role="status">{status()}</p></Show>
    <Show when={error()}><p role="alert" {...stylex.attrs(styles.error)}>{error()}</p></Show>
  </form></Dialog>;
  }}</Show>;
}
