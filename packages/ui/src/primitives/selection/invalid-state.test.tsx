import { expect, test } from 'bun:test';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { SelectControl } from './select-control';

test('delegated command mode exposes a request only during dispatch and restores accepted metadata', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const [value, setValue] = createSignal('saved');
  const requests: string[] = [];
  const dispose = render(() => <SelectControl ariaLabel="Delegated mode" value={value()} changeEventValue="requested"
    options={[{ value: 'saved', label: 'Saved' }, { value: 'next', label: 'Next' }, { value: 'blocked', label: 'Blocked' }]} onChange={() => undefined}/>, host);
  try {
    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    host.addEventListener('change', event => {
      expect(event.target === trigger).toBe(true);
      const requested = trigger.dataset.selectValue ?? '';
      requests.push(requested);
      if (requested !== 'blocked') setValue(requested);
    });
    trigger.click(); await Bun.sleep(0);
    document.querySelector<HTMLButtonElement>('[data-select-option="next"]')!.click();
    expect(value()).toBe('next'); expect(trigger.dataset.selectValue).toBe('next');
    expect(trigger.textContent).toContain('Next');
    trigger.click(); await Bun.sleep(0);
    document.querySelector<HTMLButtonElement>('[data-select-option="blocked"]')!.click();
    expect(requests).toEqual(['next', 'blocked']);
    expect(value()).toBe('next'); expect(trigger.dataset.selectValue).toBe('next');
    expect(trigger.textContent).toContain('Next');
  } finally { dispose(); host.remove(); }
});

test('selection focus return does not steal focus from a confirmation opened by its host', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const confirmation = document.createElement('section'); confirmation.setAttribute('role', 'dialog'); confirmation.tabIndex = -1; host.append(confirmation);
  const dispose = render(() => <SelectControl ariaLabel="Template" value="custom" options={[{ value: 'custom', label: 'Custom', description: 'Keep custom details' }, { value: 'build', label: 'Build' }]} onChange={() => queueMicrotask(() => confirmation.focus())}/>, host);
  try {
    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    trigger.click(); await Bun.sleep(0);
    [...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(node => node.textContent === 'Build')!.click();
    await Bun.sleep(0);
    expect(document.activeElement === confirmation).toBe(true);
    expect(Boolean(document.querySelector('[role=tooltip]'))).toBe(false);
  } finally { dispose(); host.remove(); }
});

test('a guarded selection keeps DOM metadata aligned until the host accepts it', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const [value, setValue] = createSignal('saved'); let requested = ''; let observed = '';
  const dispose = render(() => <SelectControl ariaLabel="Mode" value={value()} options={[{ value: 'saved', label: 'Saved mode' }, { value: 'next', label: 'Next mode' }]} onChange={next => { requested = next; }}/>, host);
  try {
    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    trigger.addEventListener('change', () => { observed = trigger.dataset.selectValue ?? ''; });
    trigger.click(); await Bun.sleep(0);
    [...document.querySelectorAll<HTMLButtonElement>('[role=option]')].find(node => node.textContent === 'Next mode')!.click();
    expect(requested).toBe('next'); expect(observed).toBe('saved');
    expect(trigger.dataset.selectValue).toBe('saved'); expect(trigger.textContent).toContain('Saved mode');
    setValue(requested); expect(trigger.dataset.selectValue).toBe('next'); expect(trigger.textContent).toContain('Next mode');
  } finally { dispose(); host.remove(); }
});

test('a rejected selection exposes its error and retains accepted value for DOM consumers', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const [invalid, setInvalid] = createSignal(false);
  const [value, setValue] = createSignal('fixed');
  const dispose = render(() => <><SelectControl ariaLabel="Discount type" value={value()} invalid={invalid()} describedBy={invalid() ? 'type-error' : undefined}
    options={[{ value: 'fixed', label: 'Fixed' }, { value: 'percent', label: 'Percent' }, { value: 'delivery', label: 'Delivery' }]}
    onChange={next => { setInvalid(next === 'percent'); if (next !== 'percent') setValue(next); }}/><p id="type-error">Reduce amount before choosing percent.</p></>, host);
  try {
    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    trigger.click(); await Bun.sleep(0);
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(node => node.textContent === 'Percent');
    expect(option).toBeDefined(); option!.click();
    await Bun.sleep(0);
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe('type-error');
    expect(trigger.dataset.selectValue).toBe('fixed');
    expect(trigger.textContent).toContain('Fixed'); expect(document.activeElement).toBe(trigger);
    expect(Boolean(document.querySelector('[role="tooltip"]'))).toBe(false);
    trigger.click(); await Bun.sleep(0);
    [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(node => node.textContent === 'Delivery')!.click();
    expect(trigger.hasAttribute('aria-invalid')).toBe(false); expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    expect(value()).toBe('delivery'); expect(trigger.dataset.selectValue).toBe('delivery');
  } finally { dispose(); host.remove(); }
});
