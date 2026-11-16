import { afterEach, expect, test } from 'bun:test';
import { createGameActionList, validateGameActions, type GameMenuAction } from './actions';
import { attachGameModal } from './modal';
import { createGameSections } from './sections';

afterEach(() => document.body.replaceChildren());
const primary = (): GameMenuAction => ({ id: 'play', label: 'Play', audience: 'player', priority: 'primary', run() {} });
test('composition rejects button soup, ambiguous priority, developer leakage, duplicates and unexplained unavailability', () => {
  expect(() => validateGameActions(Array.from({ length: 7 }, (_, id) => ({ ...primary(), id: String(id), priority: id ? 'secondary' : 'primary' })), 'player')).toThrow('six');
  expect(() => validateGameActions([{ ...primary(), priority: 'secondary' }], 'player')).toThrow('primary');
  expect(() => validateGameActions([primary(), { ...primary(), id: 'second' }], 'player')).toThrow('primary');
  expect(() => validateGameActions([primary(), primary()], 'player')).toThrow('unique');
  expect(() => validateGameActions([{ ...primary(), audience: 'developer' }], 'player')).toThrow('audience');
  expect(() => validateGameActions([{ ...primary(), disabled: true }], 'player')).toThrow('reason');
  expect(() => validateGameActions([{ ...primary(), disabled: true, explanation: ' ' }], 'player')).toThrow('reason');
  expect(() => validateGameActions([{ ...primary(), id: ' ' }], 'player')).toThrow('ID');
  expect(() => validateGameActions([{ ...primary(), id: 'settings', priority: 'utility' }, primary()], 'player')).toThrow('first');
});
test('held activation keys cannot advance a second menu', () => {
  const list = createGameActionList({ audience: 'player' });document.body.append(list.element);list.render([primary()]);
  const button = list.element.querySelector('button')!;
  for (const key of ['Enter', ' ']) {
    expect(button.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true, cancelable: true }))).toBe(false);
    expect(button.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: false, cancelable: true }))).toBe(true);
  }
});
test('availability updates preserve node identity and recover focus when the selected action becomes unavailable', () => {
  const list = createGameActionList({ audience: 'player' });document.body.append(list.element);
  let count = 0;const play = { ...primary(), run() { count++; } }, practice = { ...primary(), id: 'practice', label: 'Practice', priority: 'secondary' as const };
  list.render([play, practice]);const button = list.element.querySelector('button')!;button.focus();button.click();expect(count).toBe(1);
  list.render([{ ...play, disabled: true, explanation: 'Service unavailable.' }, practice]);
  expect(button === list.element.querySelector('button')).toBe(true);expect(document.activeElement?.getAttribute('data-menu-action')).toBe('practice');button.click();expect(count).toBe(1);
});
test('category selection removes inactive controls from traversal and preserves their draft state', () => {
  const parent = document.createElement('div'), first = document.createElement('section'), second = document.createElement('section');first.innerHTML = '<input value="saved draft">';second.innerHTML = '<button>Claim</button>';parent.append(first, second);document.body.append(parent);
  const categories = createGameSections({ parent, label: 'Options', sections: [{ id: 'first', label: 'First', content: first }, { id: 'second', label: 'Second', content: second }] });
  expect(second.hidden).toBe(true);categories.select('second');expect(first.hidden).toBe(true);expect(second.hidden).toBe(false);
  categories.available(['first']);expect(second.hidden).toBe(true);expect(first.querySelector('input')!.value).toBe('saved draft');
  expect(parent.querySelector('[aria-selected=true]')?.textContent).toBe('First');categories.dispose();
});
test('native Escape retains cancel default behavior and stops later gameplay handlers', () => {
  const trigger = document.createElement('button'), dialog = document.createElement('dialog');dialog.innerHTML = '<button>Continue</button><button>Back</button>';document.body.append(trigger, dialog);
  let leaked = 0;const listener = () => leaked++;
  const modal = attachGameModal({ dialog });
  try { for (let index = 0; index < 5; index++) {
    trigger.focus();modal.open();window.addEventListener('keydown', listener);
    const key = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });dialog.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    // Happy DOM has no keyboard default: model the browser's cancel/close sequence.
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    expect(dialog.open).toBe(false);expect(document.activeElement === trigger).toBe(true);
    window.removeEventListener('keydown', listener);
  }expect(leaked).toBe(0); }
  finally { modal.dispose();window.removeEventListener('keydown', listener); }
});

test('user dismissal cancels pending work while a programmatic phase handoff does not', () => {
  const dialog = document.createElement('dialog');dialog.innerHTML = '<button>Join</button>';document.body.append(dialog);
  let canceled = 0;const modal = attachGameModal({ dialog, onRequestClose() { canceled++; } });
  modal.open();modal.close();expect(canceled).toBe(0);
  modal.open();if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();expect(canceled).toBe(1);expect(dialog.open).toBe(false);
  modal.open();const veto = (event: Event) => event.preventDefault();dialog.addEventListener('cancel', veto);
  expect(dialog.dispatchEvent(new Event('cancel', { cancelable: true }))).toBe(false);expect(canceled).toBe(1);expect(dialog.open).toBe(true);
  dialog.removeEventListener('cancel', veto);modal.dispose();
});
