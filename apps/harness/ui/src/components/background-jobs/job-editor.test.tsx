/** @jsxImportSource solid-js */
import { beforeEach, expect, it } from 'bun:test';
import { fireEvent, render, screen } from '@solidjs/testing-library';
import { harnessStore } from '../../harness-store';
import { createUiTest } from '../../utils/tests/test-harness';
import { clearBrowserStateForTests, seedHarnessStoreForTests } from '../../utils/tests/store-test-utils';
import { createHarnessStateFixture, createViewProjectFixture } from '../../utils/tests/test-fixtures';
import { BackgroundJobEditorDialog } from '../background-job-editor-dialog';
import { JobOutcome } from './job-outcome';
import { createBackgroundJobRunFixture } from '../../utils/tests/test-fixtures';

createUiTest('Scheduled task hierarchy', () => {
  beforeEach(clearBrowserStateForTests);
  it('distinguishes absent loaded history from a failed outcome without claiming the job never ran', () => {
    const view = render(() => <JobOutcome tone="warning" />);
    expect(screen.getByText('No recent run history is loaded for this job.')).toBeTruthy();
    view.unmount();
    render(() => <JobOutcome tone="warning" run={createBackgroundJobRunFixture({ failureMessage: 'Review failed checks', status: 'failed' })} pauseReason="Execution paused" />);
    expect(screen.getByRole('region', { name: 'Latest run outcome' }).textContent).toContain('Review failed checks');
    expect(screen.getByRole('status').textContent).toBe('Execution paused');
  });
  it('keeps prompt and schedule ahead of optional execution settings and explains blocked save', () => {
    const project = createViewProjectFixture({ id: 'schedule-project' });
    seedHarnessStoreForTests(createHarnessStateFixture({ workspace: { projects: [project], activeProjectId: project.id } }));
    harnessStore.openBackgroundJobEditor({ source: 'create', projectId: project.id, kind: 'ai-routine', name: '', description: '', scheduleInput: '', timezone: 'UTC', aiPrompt: 'Review builds', shellExecutable: '', shellArgsText: '', shellCwd: '', shellEnvRefsText: '', shellTimeoutSeconds: 600, shellNetworkAccess: false });
    render(() => <BackgroundJobEditorDialog />);
    expect(screen.getByText('Enter a task name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save task' }).hasAttribute('disabled')).toBe(true);
    const settings = screen.getByText('AI execution settings').closest('details');
    expect(settings?.open).toBe(false);
    fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Morning review' } });
    expect(screen.getByText('Enter a valid schedule')).toBeTruthy();
    expect(screen.getByLabelText('What should the AI do?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Discard task changes?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(harnessStore.state.backgroundJobEditorOpen).toBe(false);
  });
});
