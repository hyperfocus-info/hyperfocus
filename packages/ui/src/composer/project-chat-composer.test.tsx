import { expect, test } from 'bun:test';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { ProjectChatComposer } from './project-chat-composer';

test('shared project composer preserves multiline, IME, host cancellation, disabled and Tab behavior', () => {
  const host = document.createElement('div'); document.body.append(host);
  const [disabled, setDisabled] = createSignal(false);
  let sends = 0, input = '';
  const dispose = render(() => <ProjectChatComposer value="" placeholder="Message" disabled={disabled()} onInput={value => { input = value; }} onSubmit={() => sends++} onKeyDown={event => { if (event.altKey) event.preventDefault(); }}/>, host);
  try {
    const area = host.querySelector('textarea'); if (!area) throw new Error('Missing composer');
    area.value = 'Draft'; area.dispatchEvent(new Event('input', { bubbles: true })); expect(input).toBe('Draft');
    for (const options of [{ key: 'Tab' }, { key: 'Enter', shiftKey: true }, { key: 'Enter', isComposing: true }]) {
      const event = new KeyboardEvent('keydown', { ...options, bubbles: true, cancelable: true });
      area.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
    }
    expect(sends).toBe(0);
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); expect(sends).toBe(1);
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true, bubbles: true, cancelable: true })); expect(sends).toBe(1);
    setDisabled(true);
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); expect(sends).toBe(1);
  } finally { dispose(); host.remove(); }
});
