import { attachGameModal, createGameActionList, createGameSelect, type GameMenuAction } from '@hyperfocus/ui/game-menu';
import { createIndexedDbSaveStorage } from '@hyperfocus/engine/save/browser';
import { createSituationStore, situationStorageBytes } from './situation-store';
import { defaultOpponentSequence, type createOpponentRoutine, type OpponentSequence } from './opponent-routine';
import type { createLocalExchangeReview } from './local-exchange';

export function createPracticeLibrary(options: {
  canvas: HTMLCanvasElement; projectId: string; contentId: string;
  routine: ReturnType<typeof createOpponentRoutine>;
  review: Pick<ReturnType<typeof createLocalExchangeReview>, 'state'> & {
    save(): ReturnType<ReturnType<typeof createLocalExchangeReview>['save']> | Promise<ReturnType<ReturnType<typeof createLocalExchangeReview>['save']>>;
    load(saved: unknown): void | Promise<unknown>;
  };
  opened(): void; closed(): void; resume(): void;
}) {
  const storage = createIndexedDbSaveStorage({ maxBytes: situationStorageBytes });
  const store = createSituationStore({ storage, projectId: options.projectId, contentId: options.contentId });
  const root = document.createElement('section');root.className = 'hf-practice-library';
  const library = document.createElement('button');library.type = 'button';library.dataset.situationsOpen = '';library.textContent = 'Saved situations';
  const routine = document.createElement('button');routine.type = 'button';routine.dataset.routineOpen = '';routine.textContent = 'Opponent routine';
  const dialog = document.createElement('dialog');dialog.setAttribute('aria-label', 'Practice situations');
  const heading = document.createElement('h2'), intro = document.createElement('p'), fields = document.createElement('div');
  const status = document.createElement('p');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');
  const actions = createGameActionList({ audience: 'player', primaryRequired: false });
  const back = document.createElement('button');back.type = 'button';back.className = 'tod-back';back.textContent = 'Return';back.dataset.menuBack = '';
  const style = document.createElement('style');style.textContent = '.hf-practice-library>button{display:none}.hf-practice-library .hf-game-modal{width:min(42rem,calc(100vw - 2rem))}.hf-practice-library label{display:grid;gap:.5rem;margin:1rem 0}.hf-practice-library input,.hf-practice-library select{min-height:44px;font:inherit;padding:.5rem;background:var(--game-ink);color:var(--game-text);border:1px solid var(--game-line)}.hf-practice-library fieldset{display:grid;grid-template-columns:1fr 1fr;gap:1rem;border:1px solid var(--game-line)}';
  dialog.append(heading, intro, fields, actions.element, status, back);root.append(style, library, routine, dialog);options.canvas.parentElement?.append(root);
  let busy = false, disposed = false, generation = 0, page = 'library', saveKind: 'routine' | 'exchange' = 'exchange', selected = '', message = '';
  let entries: Awaited<ReturnType<typeof store.list>> = [];
  let readSequence: () => OpponentSequence = () => structuredClone(defaultOpponentSequence);
  const selectors: ReturnType<typeof createGameSelect>[] = [];
  const modal = attachGameModal({ dialog, onClose() { for (const select of selectors) select.close();generation++;options.closed(); } });
  const item = (id: string, label: string, run: () => void, disabled = false, explanation?: string): GameMenuAction => ({ id, label, run, audience: 'player', priority: 'secondary', disabled: busy || disabled, explanation: busy ? 'Wait for the current save operation.' : explanation ?? (disabled ? id === 'stop' ? 'No routine is running.' : 'Start a routine before saving it.' : undefined) });
  async function perform(work: () => Promise<void>) {
    if (busy || disposed) return;busy = true;message = 'Working…';renderActions();
    try { await work();if (!disposed) message = ''; }
    catch (cause) { if (!disposed) message = cause instanceof Error ? cause.message : 'Unable to access saved situations. Try again.'; }
    finally { busy = false;if (!disposed) { render();if (dialog.open) actions.focus(); } }
  }
  function open(next: string) { options.opened();page = next;message = '';render();modal.open(fields.querySelector<HTMLElement>('input,button') ?? undefined);dialog.scrollTop = 0;if (next === 'library') void perform(async () => { entries = await store.list(); }); }
  function exitToPlay() { modal.close();options.resume();options.canvas.focus({ preventScroll: true }); }
  function renderActions() {
    status.textContent = message;back.disabled = busy;
    let rows: GameMenuAction[] = [];
    if (page === 'library') rows = entries.map(entry => item(entry.id, entry.title, () => { selected = entry.id;page = 'detail';render();actions.focus(); }, false, `${entry.kind === 'routine' ? 'Opponent routine' : 'Recorded exchange'} · ${new Date(entry.savedAt).toLocaleDateString()}${entry.compatible ? '' : ' · Different game version'}`));
    if (page === 'library' && !entries.length) rows = [item('create', 'Build your first situation', () => { page = 'routine';render();actions.focus(); }, false, 'Choose an opponent action, try the loop, then save it for next time.')];
    if (page === 'detail') {
      const entry = entries.find(entry => entry.id === selected);
      rows = [item('open', 'Open situation', () => void perform(async () => {
        const attempt = generation;
        const saved = await store.load(selected);
        if (disposed || attempt !== generation || !dialog.open) return;
        options.routine.stop();
        if (saved.kind === 'exchange') await options.review.load(saved.recording);else options.routine.load(saved.recording);
        if (disposed || attempt !== generation || !dialog.open) return;
        exitToPlay();
      }), !entry?.compatible, !entry?.compatible ? 'Use the game version that created this situation.' : undefined), item('delete', 'Delete this situation', () => { page = 'delete';render();actions.focus(); })];
    }
    if (page === 'delete') rows = [item('confirm-delete', 'Delete saved situation', () => void perform(async () => { await store.remove(selected);entries = await store.list();page = 'library'; })), item('keep', 'Keep situation', () => { page = 'detail';render();actions.focus(); })];
    if (page === 'routine') rows = [item('start', 'Start loop from here', () => { try { options.routine.start(readSequence());exitToPlay(); } catch (cause) { message = cause instanceof Error ? cause.message : 'Unable to start this routine.';renderActions(); } }), item('stop', 'Stop and reset', () => { options.routine.stop();render(); }, !options.routine.state.running), item('save-routine', 'Save routine', () => { saveKind = 'routine';page = 'save';render(); }, !options.routine.state.available)];
    if (page === 'save') rows = [item('save', 'Save on this device', () => {
      const title = fields.querySelector<HTMLInputElement>('input')!.value;
      void perform(async () => { await store.save({ title, kind: saveKind, recording: saveKind === 'exchange' ? await options.review.save() : options.routine.save() });entries = await store.list();page = 'saved'; });
    })];
    if (page === 'saved') rows = [item('return', 'Return to practice', () => modal.close())];
    actions.render(rows.map((row, index) => ({ ...row, priority: index === 0 && !row.disabled ? 'primary' : 'secondary' })));
    for (const field of fields.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button')) field.disabled = busy;
  }
  function render() {
    const focused = document.activeElement, value = fields.querySelector<HTMLInputElement>('input[data-name]')?.value;
    heading.textContent = page === 'routine' ? 'Opponent routine' : page === 'save' ? 'Save situation' : page === 'saved' ? 'Situation saved' : page === 'library' ? 'Saved situations' : entries.find(entry => entry.id === selected)?.title ?? 'Saved situation';
    intro.textContent = page === 'routine' ? 'Set up your spacing first. Each loop restores both fighters and the arena to this starting point. Actions use normal attack and recovery rules; an early press can fail. Guard stays held until the next action.' : page === 'save' ? 'Keep this starting state on this device. Five slots, up to 8 MiB each and 32 MiB total. Saved situations work with this game version.' : page === 'saved' ? 'Find it again in Main menu → Practice → Saved situations. No rewards are earned during exchange review.' : page === 'delete' ? 'This removes the saved situation from this device.' : page === 'library' ? entries.length ? 'Choose a recorded exchange or opponent routine.' : 'No saved situations yet. Save from a paused exchange review or an opponent routine.' : 'Open to retry the same starting situation.';
    for (const select of selectors.splice(0)) select.dispose();
    fields.replaceChildren();
    if (page === 'save') {
      const label = document.createElement('label');label.textContent = 'Situation name';const input = document.createElement('input');input.dataset.name = '';input.maxLength = 80;input.value = value ?? (saveKind === 'exchange' ? 'My opening' : 'My opponent routine');label.append(input);fields.append(label);
    }
    if (page === 'routine') {
      const current = options.routine.state.sequence, steps: { action: ReturnType<typeof createGameSelect>; frame: HTMLInputElement }[] = [];
      for (let index = 0; index < 3; index++) {
        const row = document.createElement('fieldset'), legend = document.createElement('legend');legend.textContent = `Action ${index + 1}`;
        const actionLabel = document.createElement('label');actionLabel.textContent = 'Action';
        const select = createGameSelect({ element: document.createElement('button'), ariaLabel: `Action ${index + 1}`, value: current.steps[index]?.action ?? '', options: ['', ...options.routine.actions].map(value => ({ value, label: value || 'None' })) });
        selectors.push(select);actionLabel.append(select.element);
        const frameLabel = document.createElement('label');frameLabel.textContent = 'At frame';const frame = document.createElement('input');frame.type = 'number';frame.min = '0';frame.max = '599';frame.step = '1';frame.value = String(current.steps[index]?.frame ?? 100);frame.setAttribute('aria-label', `Action ${index + 1} frame`);frameLabel.append(frame);row.append(legend, actionLabel, frameLabel);fields.append(row);steps.push({ action: select, frame });
      }
      const label = document.createElement('label');label.textContent = 'Loop length in frames (60 frames = 1 simulation second)';const length = document.createElement('input');length.type = 'number';length.min = '60';length.max = '600';length.step = '1';length.value = String(current.length);length.setAttribute('aria-label', 'Loop length');label.append(length);fields.append(label);
      readSequence = () => ({ steps: steps.filter(step => step.action.value).map(step => ({ action: step.action.value, frame: Number(step.frame.value) })), length: Number(length.value) });
    }
    renderActions();if (focused && dialog.contains(focused) && !focused.isConnected) actions.focus();
  }
  library.onclick = () => open('library');routine.onclick = () => open('routine');
  back.onclick = () => { if (page === 'detail' || page === 'delete') { page = 'library';render();actions.focus(); } else modal.close(); };
  return {
    get focused() { return dialog.open; },
    saveExchange() { saveKind = 'exchange';open('save'); },
    render(input: { available: boolean; practice: boolean }) { library.hidden = !input.available;routine.hidden = !input.available || !input.practice; },
    dispose() { disposed = true;for (const select of selectors) select.dispose();modal.dispose();root.remove();void storage.close(); },
  };
}
