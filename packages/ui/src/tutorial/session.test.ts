import { expect, test } from 'bun:test';
import { createTutorialSession } from './session';

const definition = { id: 'save', title: 'Save a document', objective: 'Keep an editable copy.', steps: [
  { id: 'name', label: 'Name', instruction: 'Name the document', input: 'Name field', timing: 'Before saving', success: 'A valid name is entered.' },
  { id: 'save', label: 'Save', instruction: 'Save it', input: 'Save', timing: 'After naming', success: 'The host confirms persistence.' },
], completion: 'Document saved' };
test('completion requires all observed steps, then active acknowledgement time; demonstrations and stale attempts cannot pass', () => {
  const session = createTutorialSession({ definition, settleMs: 200 });
  const observe = (completed: string[], deltaMs = 100) => session.observe({ attempt: session.state.attempt, completed, deltaMs, source: 'player' });
  session.observe({ attempt: 0, completed: ['name', 'save'], deltaMs: 100, source: 'demonstration' });expect(session.state.complete).toBe(false);
  observe(['name']);expect(session.state.complete).toBe(false);observe(['save']);expect(session.state.complete).toBe(true);expect(session.state.advanceReady).toBe(false);
  session.observe({ attempt: 0, completed: [], deltaMs: 5000, suspended: true, source: 'player' });expect(session.state.advanceReady).toBe(false);
  observe([], 5000);expect(session.state.advanceReady).toBe(false);observe([]);expect(session.state.advanceReady).toBe(true);
  session.retry();session.observe({ attempt: 0, completed: ['name', 'save'], deltaMs: 100, source: 'player' });expect(session.state.complete).toBe(false);
  expect(session.state.completed).toEqual([]);
});
test('contract rejects vague steps, excessive complexity, unknown success evidence and unactionable feedback', () => {
  expect(() => createTutorialSession({ definition: { ...definition, steps: [{ ...definition.steps[0]!, timing: '' }] } })).toThrow('timing');
  expect(() => createTutorialSession({ definition: { ...definition, steps: Array(7).fill(definition.steps[0]) } })).toThrow('six');
  const session = createTutorialSession({ definition });
  expect(() => session.observe({ attempt: 0, completed: ['invented'], deltaMs: 0, source: 'player' })).toThrow('evidence');
  expect(() => session.observe({ attempt: 0, completed: [], deltaMs: 0, source: 'player', feedback: { id: 'failed', message: 'Wrong', correction: '' } })).toThrow('correction');
});

test('invalid feedback rejects the whole observation without retaining progress or advancing time', () => {
  const session = createTutorialSession({ definition, settleMs: 100 });
  const before = session.state;
  expect(() => session.observe({ attempt: 0, completed: ['name', 'save'], deltaMs: 100, source: 'player', feedback: { id: 'miss', message: 'Failed', correction: ' ' } })).toThrow('correction');
  expect(session.state).toEqual(before);
  session.observe({ attempt: 0, completed: [], deltaMs: 100, source: 'player' });
  expect(session.state.complete).toBe(false);
  session.observe({ attempt: 0, completed: ['name', 'save'], deltaMs: 0, source: 'player' });
  expect(session.state.complete).toBe(true);
  expect(() => session.observe({ attempt: 0, completed: [], deltaMs: 100, source: 'player', feedback: { id: 'miss', message: 'Failed', correction: '' } })).toThrow('correction');
  expect(session.state.advanceReady).toBe(false);
});
