import { afterEach, expect, test } from 'bun:test';
import { createSignal, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { RecoveryNotice } from './recovery-notice';
import { Button } from './button';

afterEach(() => document.body.replaceChildren());
test('recovery notice always exposes an independent enabled dismissal while retry is unavailable', () => {
  const [visible, setVisible] = createSignal(true); let writes = 0;
  const retained = { draft: 'unsaved work' };
  const dispose = render(() => <Show when={visible()}><RecoveryNotice message="Storage unavailable" onDismiss={() => setVisible(false)}><Button disabled justificationForNoTooltip="Retry unavailable" onClick={() => writes++}>Retry</Button></RecoveryNotice></Show>, document.body);
  const dismiss = [...document.querySelectorAll('button')].find(button => button.textContent === 'Dismiss')!;
  expect(dismiss.disabled).toBe(false); expect(dismiss.type).toBe('button'); dismiss.click();
  expect(document.querySelector('[role=alert]')).toBeNull(); expect(writes).toBe(0); expect(retained.draft).toBe('unsaved work'); dispose();
});
