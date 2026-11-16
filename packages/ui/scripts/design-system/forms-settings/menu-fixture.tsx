import { For, createSignal } from 'solid-js';
import { ActionMenu, MenuItem } from '../../../src/primitives/action-menu';
import { Button } from '../../../src/primitives/button';
import { Dialog } from '../../../src/primitives/dialog';

export function MenuFixture() {
  const [open, setOpen] = createSignal(false);
  const [chosen, setChosen] = createSignal('');
  const rows = () => <For each={['first', 'second']}>{id => <section data-context-record={id} style={{ padding: '1rem' }}>
    <Button justificationForNoTooltip="Resource name">{id} resource</Button>
    <ActionMenu ariaLabel={`${id} actions`} contextTarget={trigger => trigger.closest<HTMLElement>('[data-context-record]')}
      trigger={({toggle}) => <Button aria-label={`${id} actions`} justificationForNoTooltip="Actions label" onClick={toggle}>Actions</Button>}>
      <MenuItem onSelect={() => setChosen(`${id}:copy`)}>Copy full path</MenuItem>
      <MenuItem disabled onSelect={() => setChosen('unavailable')}>Unavailable</MenuItem>
      <MenuItem onSelect={() => setChosen(`${id}:folder`)}>Open containing folder</MenuItem>
    </ActionMenu>
    <input aria-label={`${id} file path`} readOnly value={`C:\\Music\\${id}\\mix.flp`}/>
  </section>}</For>;
  return <main>
    {rows()}
    <output aria-label="Chosen command">{chosen()}</output>
    <Button justificationForNoTooltip="Visible action" onClick={() => setOpen(true)}>File dialog</Button>
    <Dialog open={open()} title="File dialog" onClose={() => setOpen(false)}>{rows()}</Dialog>
  </main>;
}
