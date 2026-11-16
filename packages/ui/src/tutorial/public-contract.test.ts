import { expect, test } from 'bun:test';
import { createTutorialCoach, validateTutorialTiming } from '@hyperfocus/ui/tutorial';
import { createTutorialSession, validateTutorialDefinition, validateTutorialFeedback } from '@hyperfocus/ui/tutorial/session';

test('public entries compose a non-game host with the same evidence and presentation contract', () => {
  const definition = { id: 'save-copy', title: 'Keep your work', objective: 'Save an editable copy', completion: 'Copy saved', steps: [
    { id: 'stored', label: 'Save', instruction: 'Save the document', input: 'Save', timing: 'After naming it; no time limit', success: 'Storage confirms the copy exists' },
  ] };
  validateTutorialDefinition(definition);
  validateTutorialTiming({ label: 'Transfer', value: .2, total: .5, cue: 'Wait for storage' });
  const feedback = { id: 'storage-error', message: 'Storage is unavailable', correction: 'Reconnect storage, then retry. Your draft is retained.' };
  validateTutorialFeedback(feedback);
  const session = createTutorialSession({ definition }), parent = document.createElement('div');document.body.append(parent);
  const coach = createTutorialCoach({ parent, watch() {}, retry() { session.retry(); }, back() {} });
  try {
    session.observe({ attempt: 0, completed: [], deltaMs: 0, source: 'player', feedback });coach.render({ definition, ...session.state });
    expect(parent.querySelector('[role=status]')?.textContent).toContain('Your draft is retained');
    session.observe({ attempt: 0, completed: ['stored'], deltaMs: 0, source: 'player' });coach.render({ definition, ...session.state });
    expect(parent.querySelector('h3')?.textContent).toBe('Copy saved');
    expect(parent.textContent).not.toContain('Practice');expect(parent.textContent).not.toContain('Pause');
  } finally { coach.dispose();parent.remove(); }
});
