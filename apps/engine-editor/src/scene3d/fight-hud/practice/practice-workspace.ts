import { attachGameModal, createGameSections } from '@hyperfocus/ui/game-menu';
import { practiceInstruments, practicePreset } from './practice-catalog';
import { practiceWorkspaceStyles } from './practice-workspace-theme';

/** One task dock, one pinned instrument, one configuration boundary. No combat ownership. */
export function createPracticeWorkspace(options: { canvas: HTMLCanvasElement; setup?(): void; reset?(): void; opened?(): void; closed?(): void }) {
  const root = document.createElement('section');root.className = 'hf-practice-workspace';root.hidden = true;
  root.dataset.compact = String(!options.setup);
  const style = document.createElement('style');style.textContent = practiceWorkspaceStyles;
  const dock = document.createElement('section');dock.className = 'hf-practice-dock';dock.setAttribute('aria-label', 'Practice session');
  const eyebrow = document.createElement('p');eyebrow.className = 'hf-practice-eyebrow';eyebrow.textContent = 'Practice';
  const title = document.createElement('h2'), cue = document.createElement('p'), actions = document.createElement('nav');actions.setAttribute('aria-label', 'Practice actions');
  const button = (label: string, run: () => void) => { const node = document.createElement('button');node.type = 'button';node.textContent = label;node.onclick = run;return node; };
  const setup = button('Training setup', () => options.setup?.()), reset = button('Reset', () => options.reset?.());
  setup.hidden = !options.setup;reset.hidden = !options.reset;
  const trigger = button('Practice readouts', () => open());trigger.dataset.practiceOpen = '';
  const readouts = button('Readouts', () => open());actions.append(setup, readouts, reset);dock.append(eyebrow, title, cue, actions);
  const dialog = document.createElement('dialog');dialog.className = 'hf-practice-panel';dialog.setAttribute('aria-label', 'Practice readouts');
  const heading = document.createElement('h2');heading.textContent = 'Practice readouts';
  const intro = document.createElement('p');intro.textContent = 'Pin one readout beside the arena. Hitboxes can stay on with any readout.';
  const close = button('Return', () => modal.close());close.dataset.menuBack = '';
  const categories = document.createElement('div');categories.className = 'hf-practice-categories';
  const groups = [{ id: 'timing', label: 'Timing & inputs' }, { id: 'attempts', label: 'Attempt review' }, { id: 'arena', label: 'Arena' }].map(group => ({ ...group, content: document.createElement('section') }));
  const selected = document.createElement('p');selected.className = 'hf-practice-selection';selected.setAttribute('role', 'status');
  const preview = document.createElement('section');preview.className = 'hf-practice-preview';
  const previewTitle = document.createElement('h3'), previewText = document.createElement('pre');previewTitle.textContent = 'Last observed';preview.append(previewTitle, previewText);
  const off = button('Clear readouts', () => { for (const control of controls.values()) control.checked = false;refresh(); });
  const footer = document.createElement('footer');footer.append(off, close);
  dialog.append(heading, intro, categories, selected, preview, footer);
  const pinned = document.createElement('aside');pinned.className = 'hf-practice-readout';pinned.hidden = true;pinned.setAttribute('aria-label', 'Pinned practice readout');
  const readoutTitle = document.createElement('h3'), readoutBody = document.createElement('div'), note = document.createElement('p');
  pinned.append(readoutTitle, readoutBody, note);
  const controls = new Map<string, HTMLInputElement>(), content = new Map<string, HTMLPreElement>();
  for (const instrument of practiceInstruments) {
    const row = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'), purpose = document.createElement('p');
    row.className = 'hf-practice-instrument';input.type = 'checkbox';input.dataset.instrument = instrument.id;
    purpose.id = `practice-instrument-${crypto.randomUUID()}`;purpose.textContent = instrument.purpose;input.setAttribute('aria-describedby', purpose.id);
    label.append(input, document.createTextNode(instrument.label));row.append(label, purpose);groups.find(group => group.id === instrument.group)!.content.append(row);
    controls.set(instrument.id, input);
    input.onchange = () => {
      if (input.checked && instrument.id !== 'volumes') for (const [id, control] of controls) if (id !== instrument.id && id !== 'volumes') control.checked = false;
      refresh();
    };
    const pre = document.createElement('pre');pre.setAttribute('aria-label', instrument.label);pre.hidden = true;content.set(instrument.id, pre);readoutBody.append(pre);
  }
  categories.append(...groups.map(group => group.content));
  const sections = createGameSections({ parent: categories, label: 'Readout category', sections: groups });
  let fromArena = false;
  const modal = attachGameModal({ dialog, onClose() { options.closed?.(); } });
  dialog.addEventListener('close', () => { if (fromArena && !root.hidden) options.canvas.focus({ preventScroll: true }); });
  function refresh() {
    const instrument = practiceInstruments.find(item => item.id !== 'volumes' && controls.get(item.id)?.checked);
    const text = instrument ? `Pinned: ${instrument.label}` : 'No readout pinned';
    const next = `${text}${controls.get('volumes')?.checked ? ' · Hitboxes on' : ''}`;
    if (selected.textContent !== next) selected.textContent = next;
    readouts.textContent = instrument ? 'Readouts · 1' : 'Readouts';
    pinned.hidden = !instrument;readoutTitle.textContent = instrument?.label ?? '';
    for (const [id, pre] of content) pre.hidden = id !== instrument?.id;
    note.textContent = instrument?.id === 'timing' ? 'Startup / active / recovery · simulation frames' : instrument?.purpose ?? '';
    root.dataset.readout = instrument?.id ?? '';
    preview.hidden = !instrument;
  }
  function open() { if (dialog.open) return;fromArena = dock.contains(document.activeElement);options.opened?.();modal.open(categories.querySelector<HTMLElement>('[aria-selected=true]') ?? close); }
  root.addEventListener('keydown', event => {
    if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
    if (['Enter', ' ', 'Escape'].includes(event.key) || event.key.startsWith('Arrow')) event.stopPropagation();
    if (event.key === 'Escape' && !dialog.open) { event.preventDefault();options.canvas.focus({ preventScroll: true }); }
  });
  root.append(style, trigger, dock, pinned, dialog);options.canvas.parentElement?.append(root);refresh();
  return { element: root, dock, dialog, controls, content, refresh,
    updatePreview() { const text = content.get(root.dataset.readout ?? '')?.textContent ?? '';if (previewText.textContent !== text) previewText.textContent = text; },
    get focused() { return dialog.open || dock.contains(document.activeElement); },
    render(input: { active: boolean; preset: string; cue: string; label?: string; paused?: boolean; coaching?: boolean }) {
      root.hidden = !input.active;
      if (!input.active) { modal.close();for (const input of controls.values()) input.checked = false;refresh(); }
      dock.hidden = !!input.paused || !!input.coaching;root.dataset.paused = String(!!input.paused);root.dataset.coaching = String(!!input.coaching);
      title.textContent = input.label ?? practicePreset(input.preset)?.label ?? 'Free practice';
      const text = input.cue || practicePreset(input.preset)?.purpose || 'Choose a technique or explore freely.';
      if (cue.textContent !== text) cue.textContent = text;
      refresh();
    },
    dispose() { modal.dispose();sections.dispose();root.remove(); },
  };
}
