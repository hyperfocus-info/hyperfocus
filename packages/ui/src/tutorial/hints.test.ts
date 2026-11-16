import { expect, test } from 'bun:test';
import { createTutorialCoach } from './coach';

test('button hints toggle without replacing the instruction, progress or live bindings', () => {
  const parent = document.createElement('div');document.body.append(parent);
  const changes: boolean[] = [];
  const coach = createTutorialCoach({ parent, watch() {}, retry() {}, back() {}, hintsChanged: value => changes.push(value) });
  const definition = { id: 'launch', title: 'Launch', objective: 'Lift the opponent', completion: 'Launched', steps: [{ id: 'hit', label: 'Launch', instruction: 'Launch the opponent', input: 'K', timing: 'Press once', success: 'An upward hit connects' }] };
  try {
    coach.render({ definition, completed: [], complete: false });
    const toggle = parent.querySelector<HTMLButtonElement>('[data-tutorial-hints]')!;
    toggle.click();expect(toggle.getAttribute('aria-pressed')).toBe('false');expect(coach.element.dataset.hints).toBe('false');
    expect(parent.querySelector('h3')?.textContent).toBe('Launch the opponent');
    coach.render({ definition: { ...definition, steps: [{ ...definition.steps[0]!, input: 'Triangle' }] }, completed: [], complete: false });
    toggle.click();expect(parent.querySelector('[data-tutorial-input]')?.textContent).toBe('Triangle');expect(changes).toEqual([false, true]);
  } finally { coach.dispose();parent.remove(); }
});

test('automatic retry hosts reveal both completion choices without requiring a manual reset', () => {
  const parent = document.createElement('div');document.body.append(parent);
  const coach = createTutorialCoach({ parent, watch() {}, retry() {}, back() {}, next() {} });
  const definition = { id: 'one', title: 'One', objective: 'Land a hit', completion: 'Lesson complete', steps: [{ id: 'hit', label: 'Hit', instruction: 'Hit', input: 'J', timing: 'Now', success: 'Contact' }] };
  try {
    coach.render({ definition, completed: [], complete: false, automaticRetry: true });
    expect(parent.querySelector<HTMLButtonElement>('[data-tutorial-retry]')!.hidden).toBe(true);
    coach.render({ definition, completed: ['hit'], complete: true, automaticRetry: true, continueLabel: 'Next lesson', retryLabel: 'Practice again', reward: '+25 coins saved' });
    expect(parent.querySelector<HTMLButtonElement>('[data-tutorial-retry]')!.hidden).toBe(false);
    expect(parent.querySelector('[data-tutorial-retry]')!.textContent).toBe('Practice again');
    expect(parent.querySelector('[data-tutorial-next]')!.textContent).toBe('Next lesson');
    expect(parent.querySelector('[data-tutorial-reward]')!.textContent).toBe('+25 coins saved');
  } finally { coach.dispose();parent.remove(); }
});
