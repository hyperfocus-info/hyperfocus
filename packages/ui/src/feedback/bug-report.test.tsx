import { expect, spyOn, test } from 'bun:test';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { BugReportDialog } from './bug-report';

test('report review gates draft opening, edits invalidate it, and reopening gets a new lifetime', () => {
  const host = document.createElement('div'); document.body.append(host);
  const [open, setOpen] = createSignal(true), [view, setView] = createSignal('invoice');
  const browser = spyOn(window, 'open').mockReturnValue(null);
  const dispose = render(() => <BugReportDialog open={open()} onClose={() => setOpen(false)} repository={{ owner: 'hyperfocus-info', name: 'hyperfocus' }} context={{ application: 'Books', version: 'fixture', view: view(), viewport: '390x844', browser: 'fixture' }}/>, host);
  try {
    const summary = document.querySelector('form[aria-label="Bug report"] input:not([type="checkbox"]):not([type="file"])');
    const steps = document.querySelector('form[aria-label="Bug report"] textarea');
    const review = document.querySelector('form[aria-label="Bug report"] input[type="checkbox"]');
    const form = document.querySelector('form[aria-label="Bug report"]');
    if (!(summary instanceof HTMLInputElement) || !(steps instanceof HTMLTextAreaElement) || !(review instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) throw new Error('Missing report fields');
    summary.value = 'Draft issue'; summary.dispatchEvent(new Event('input', { bubbles: true }));
    steps.value = 'Split the tab'; steps.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(browser).not.toHaveBeenCalled();
    review.click(); setView('settings');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(browser).toHaveBeenCalledTimes(1);
    const body = new URL(String(browser.mock.calls[0]?.[0])).searchParams.get('body');
    expect(body).toContain('view: invoice');
    expect(body).not.toContain('view: settings');
    steps.value = 'Changed'; steps.dispatchEvent(new Event('input', { bubbles: true }));
    expect(review.checked).toBe(false);
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(browser).toHaveBeenCalledTimes(1);
    setOpen(false); setOpen(true);
    expect(document.querySelector('pre')?.textContent).toContain('settings');
    expect(document.querySelector('input[type="checkbox"]')?.getAttribute('checked')).not.toBe('true');
    expect(document.body.textContent).not.toContain('Continue in the GitHub draft');
  } finally { dispose(); host.remove(); browser.mockRestore(); }
});
