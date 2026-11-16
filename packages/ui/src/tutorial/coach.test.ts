import { expect, test } from 'bun:test';
import { createTutorialCoach } from './coach';

test('coaching keeps native actions stable, exposes success, traps expanded focus and avoids repeated announcements', () => {
  const parent = document.createElement('div');document.body.append(parent);let watches = 0, backs = 0;
  const coach = createTutorialCoach({ parent, watch() { watches++; }, retry() {}, back() { backs++; } });
  const definition = { id: 'connect', title: 'Connect a device', objective: 'Use the device in this app.', steps: [{ id: 'ready', label: 'Connect', instruction: 'Connect the device', input: 'USB cable', timing: 'Wait for the host to confirm readiness.', success: 'Device status is ready.' }], completion: 'Connected' };
  const input = { definition, completed: [], complete: false };
  try {
    coach.render(input);coach.element.hidden = true;coach.open();const button = parent.querySelector<HTMLButtonElement>('[data-tutorial-watch]')!;
    expect(document.activeElement).toBe(button);button.click();expect(watches).toBe(1);
    coach.render({ ...input, completed: ['ready'], complete: true });expect(document.activeElement).toBe(button);expect(parent.querySelector('h3')!.textContent).toBe('Connected');
    const message = parent.querySelector('[role=status] strong')!.firstChild;
    coach.render({ ...input, completed: ['ready'], complete: true });expect(parent.querySelector('[role=status] strong')!.firstChild).toBe(message);
    const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });button.dispatchEvent(event);
    expect(document.activeElement).toBe(parent.querySelector('[data-tutorial-back]'));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));expect(backs).toBe(1);
  } finally { coach.dispose();parent.remove(); }
});

test('direct presentation cannot bypass quality constraints or claim demonstration success', () => {
  const parent = document.createElement('div');document.body.append(parent);
  const coach = createTutorialCoach({ parent, watch() {}, retry() {}, back() {} });
  const definition = { id: 'save', title: 'Save', objective: 'Keep an editable copy', completion: 'Saved', steps: [{ id: 'save', label: 'Save', instruction: 'Save the document', input: 'Save', timing: 'After naming it', success: 'The host confirms storage' }] };
  const input = { definition, completed: [], complete: false };
  try {
    coach.render(input);coach.open();const before = coach.element.innerHTML, focused = document.activeElement;
    for (const invalid of [
      { ...input, definition: { ...definition, steps: [{ ...definition.steps[0]!, timing: '' }] } },
      { ...input, complete: true },
      { ...input, complete: true, completed: ['save'], watching: true },
      { ...input, completed: ['invented'] },
      { ...input, feedback: { id: 'bad', message: 'Wrong', correction: '' } },
      { ...input, demonstration: { unavailable: ' ' } },
      { ...input, timing: { label: 'Window', value: NaN, total: 1, cue: 'Now' } },
      { ...input, timing: { label: 'Window', value: 0, total: 0, cue: 'Now' } },
      { ...input, timing: { label: 'Window', value: 0, total: 1, cue: 'Now', window: { start: 1, end: 0 } } },
    ]) {
      expect(() => coach.render(invalid)).toThrow();expect(coach.element.innerHTML).toBe(before);expect(document.activeElement === focused).toBe(true);
    }
    coach.render({ ...input, timing: { label: 'Seconds', value: .25, total: .5, cue: 'Act now', window: { start: -1, end: 1 } } });
    expect(parent.querySelector('[role=meter]')?.getAttribute('aria-valuemax')).toBe('0.5');
    expect(parent.querySelector<HTMLElement>('[role=meter] span')?.style.width).toBe('100%');
    expect(parent.querySelector<HTMLElement>('[role=meter] i')?.style.left).toBe('50%');
  } finally { coach.dispose();parent.remove(); }
});
