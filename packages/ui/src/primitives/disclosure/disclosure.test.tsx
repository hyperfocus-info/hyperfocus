import { expect, test } from 'bun:test';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { Disclosure, type DisclosureProps } from "./disclosure";

test('public disclosure preserves a native toggle and child draft across reactive host updates', () => {
  const root = document.createElement('div'); document.body.append(root);
  const [title, setTitle] = createSignal('Initial title');
  const [defaultOpen, setDefaultOpen] = createSignal(true);
  const props: DisclosureProps = { get title() { return title(); }, get defaultOpen() { return defaultOpen(); }, children: <input aria-label="Draft"/> };
  const dispose = render(() => <Disclosure {...props}/>, root);
  try {
    const details = root.querySelector('details')!;
    const input = root.querySelector('input')!;
    expect(details.open).toBe(true);
    input.value = 'Unapplied draft';
    setDefaultOpen(false);
    expect(details.open).toBe(true);
    details.open = false;
    setTitle('Renamed title');
    expect(details.open).toBe(false);
    expect(root.querySelector('summary')?.textContent).toBe('Renamed title');
    details.open = true;
    expect(root.querySelector('input')).toBe(input);
    expect(input.value).toBe('Unapplied draft');
  } finally { dispose(); root.remove(); }
});
