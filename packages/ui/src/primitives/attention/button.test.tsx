import { afterEach, expect, test } from 'bun:test';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { Button, HomeButton, PrimaryActionScope } from '../button';

afterEach(() => document.body.replaceChildren());

test('supporting pane priority follows active task without disabling its commands', () => {
  const [active, setActive] = createSignal(false);
  let saves = 0;
  const dispose = render(() => <PrimaryActionScope active={active()}><Button variant="primary" justificationForNoTooltip="Visible action" onClick={() => saves++}>Save</Button></PrimaryActionScope>, document.body);
  expect(document.querySelector('[data-ui-primary]')).toBeNull();
  document.querySelector('button')!.click(); expect(saves).toBe(1);
  setActive(true); expect(document.querySelector('[data-ui-primary]')?.textContent).toBe('Save');
  setActive(false); expect(document.querySelector('[data-ui-primary]')).toBeNull();
  dispose();
});

test('home uses the host navigation callback and ordinary buttons have no implicit priority', () => {
  let homes = 0;
  const dispose = render(() => <><HomeButton name="Books" onClick={() => homes++}>Books</HomeButton><Button justificationForNoTooltip="Visible action">Import</Button></>, document.body);
  const home = document.querySelector<HTMLButtonElement>('[aria-label="Books home"]')!;
  expect(home.type).toBe('button'); home.click(); expect(homes).toBe(1);
  expect(document.querySelector('[data-ui-primary]')).toBeNull();
  dispose();
});
