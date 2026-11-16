import { createGameSelect } from '@hyperfocus/ui/game-menu';
import { combatActionLabel, combatBindingLabel } from '../fight-hud/control-hint.ts';
import { applyControllerLayout, controllerLayouts, migrateFlurryLayout, migrateMovementLayout, selectedControllerLayout } from './controller-layouts.ts';
import { createSettingsMix, type GameAudioMix } from './settings-mix.ts';
import { createSettingsMusic, type SettingsMusicOptions } from './settings-music.ts';
import { createGameSettings } from '../game-menu/settings';

type Mapping = { action: string; bindings: string[] };
/** Delivery preferences are local to this game; authoring bindings remain the reset defaults. */
export function createRuntimeControls(options: { canvas: HTMLCanvasElement; mappings: Mapping[]; storageKey?: string; initialAudio?: Partial<GameAudioMix>; onAudioMix?: (mix: GameAudioMix) => void; music?: SettingsMusicOptions; performance?: HTMLElement; onReducedMotion?(value: boolean): void }) {
  const defaults = structuredClone(options.mappings), key = options.storageKey ?? `hf-fight-controls:${location.pathname}`;
  const root = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('div');
  root.className = 'hf-runtime-controls';summary.textContent = 'Game settings';root.append(summary, body);
  const style = document.createElement('style');style.textContent = '.hf-runtime-controls{position:absolute;right:12px;top:12px;z-index:8;max-width:300px;max-height:45%;overflow:auto;background:#0c162bf2;color:#eaf4ff;border:1px solid #ffffff40;border-radius:5px;padding:8px;font:12px/1.5 system-ui}.hf-runtime-controls[hidden]{display:none}.hf-runtime-controls summary{cursor:pointer}.hf-runtime-controls select,.hf-runtime-controls button{min-height:32px;margin:4px;max-width:100%}.hf-runtime-controls label{display:block}.hf-runtime-controls p{margin:4px}';root.append(style);
  const action = createGameSelect({ element: document.createElement('button'), ariaLabel: 'Control to remap' });
  style.textContent += '.hf-runtime-controls>summary{position:sticky;top:-8px;z-index:2;background:#0c162b;padding:8px;margin:-8px -8px 8px;border-bottom:1px solid #ffffff40}.hf-runtime-controls .hf-audio-mix-row{display:grid;grid-template-columns:90px minmax(0,1fr) 36px;align-items:center;gap:8px;padding:5px 0}.hf-audio-mix-row input{width:100%;min-width:0;margin:0}.hf-audio-mix-row output{text-align:right;font-variant-numeric:tabular-nums}';
  const layout = createGameSelect({ element: document.createElement('button'), ariaLabel: 'Controller layout', options: [{ value: 'custom', label: 'Custom', disabled: true }, ...controllerLayouts.map(preset => ({ value: preset.id, label: preset.name, description: preset.description }))] });
  const layoutDescription = document.createElement('p');
  body.append(layout.element, layoutDescription);const layoutHint = document.createElement('p');layoutHint.textContent = 'A layout replaces controller bindings; keyboard controls stay yours. Individual remaps remain available below.';body.append(layoutHint);
  const editable = options.mappings.filter(mapping => !mapping.action.startsWith('match:') || mapping.action === 'match:start');
  const advancedLabel = document.createElement('label'), advanced = document.createElement('input');advanced.type = 'checkbox';advancedLabel.append(advanced, 'Show advanced bindings');body.append(advancedLabel);
  const primary = editable.filter(mapping => /^(move-(up|down|left|right)|pause|match:start)$/.test(mapping.action) || /:(jab|heavy|guard|drive|dash|jump|interact|escape|tech)$/.test(mapping.action));
  function updateActions() {
    const selected = action.value, choices = advanced.checked || !primary.length ? editable : primary;
    action.setOptions(choices.map(mapping => ({ value: mapping.action, label: combatActionLabel(mapping.action), description: mapping.bindings.map(combatBindingLabel).join(' / ') || 'Unbound' })));
    if (choices.some(mapping => mapping.action === selected)) action.value = selected;
  }
  updateActions();
  const remap = document.createElement('button');remap.textContent = 'Rebind selected control';const reset = document.createElement('button');reset.textContent = 'Restore defaults';
  remap.dataset.settingsRebind = '';reset.dataset.settingsReset = '';
  const status = document.createElement('p');status.setAttribute('role', 'status');body.append(action.element, remap, reset, status);
  const swap = document.createElement('button');swap.textContent = 'Swap controls';swap.hidden = true;body.append(swap);
  swap.dataset.settingsSwap = '';
  const navigation = document.createElement('p');navigation.textContent = 'Menus: stick / D-pad moves, confirm selects, back returns. Options opens Pause; Touchpad also opens Practice setup. Menu confirm and pause can be rebound.';body.append(navigation);
  const inputCheck = document.createElement('p');inputCheck.textContent = 'Input check: press a key or controller button here.';inputCheck.setAttribute('aria-label', 'Input check');body.append(inputCheck);
  let conflictSwap: { selected: Mapping; conflict: Mapping; binding: string } | undefined;
  const toggles = { keyboard: false, controller: false }, latched = { keyboard: false, controller: false }, held = { keyboard: false, controller: false };
  function checkbox(device: 'keyboard' | 'controller') { const label = document.createElement('label'), input = document.createElement('input');input.type = 'checkbox';input.dataset.driveToggle = device;label.append(input, `Toggle Drive · ${device}`);body.append(label);input.onchange = () => { toggles[device] = input.checked;latched[device] = false;save(); };return input; }
  const keyboardToggle = checkbox('keyboard'), controllerToggle = checkbox('controller');
  let waiting = false, previousPad = new Set<string>(), capturedPad = new Set<string>();
  const clearLatches = () => { latched.keyboard = latched.controller = false; };
  window.addEventListener('blur', clearLatches);
  const controlSection = document.createElement('section'), audioSection = document.createElement('section');
  controlSection.append(...body.children);body.append(audioSection, controlSection);
  const mix = createSettingsMix({ parent: audioSection, initial: options.initialAudio, onChange: value => { save();options.onAudioMix?.(value); } });
  const music = options.music ? createSettingsMusic({ parent: audioSection, ...options.music }) : undefined;
  const motionSection = document.createElement('section'), motionLabel = document.createElement('label'), motion = document.createElement('input');
  motion.type = 'checkbox';motion.checked = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  motionLabel.append(motion, 'Reduce motion and blur');motionSection.append(motionLabel);
  const motionHelp = document.createElement('p');motionHelp.textContent = 'Reduces camera effects, blur and celebrations. Combat timing, defense shapes and readable cues remain visible. Saved for this game on this device.';motionSection.append(motionHelp);
  motion.onchange = () => { save();options.onReducedMotion?.(motion.checked); };
  const settings = createGameSettings({ root, summary, body, controls: controlSection, audio: audioSection, performance: options.performance, motion: motionSection });
  function save() { try { localStorage.setItem(key, JSON.stringify({ mappings: options.mappings, toggles, audio: mix.capture(), reducedMotion: motion.checked })); } catch { status.textContent = 'Settings apply this session; local storage is unavailable.'; } }
  function display() { updateActions();layout.value = selectedControllerLayout(options.mappings);layoutDescription.textContent = controllerLayouts.find(item => item.id === layout.value)?.description ?? 'Your individual controller bindings. Choose a layout or adjust one control below.';status.textContent = options.mappings.find(mapping => mapping.action === action.value)?.bindings.map(combatBindingLabel).join(' / ') || 'Unbound · choose Rebind selected control.'; }
  function assign(binding: string) {
    const selected = options.mappings.find(mapping => mapping.action === action.value);if (!selected) return;
    const device = binding.startsWith('Gamepad');
    if (binding === 'Gamepad.Button17') { status.textContent = 'Touchpad is reserved for Practice menu navigation. Choose another button.';return; }
    const conflicts = editable.filter(mapping => mapping.action !== selected.action && mapping.bindings.includes(binding) && (mapping.action === 'pause' || selected.action === 'pause' || mapping.action.startsWith('match:') === selected.action.startsWith('match:')));
    if (conflicts.length > 1) { status.textContent = 'This button is shared by combat and menu controls. Rebind those controls first, or choose another button.';return; }
    const conflict = conflicts[0];
    if (conflict) { status.textContent = `${combatBindingLabel(binding)} is already used by ${combatActionLabel(conflict.action)}. Swap controls or choose another binding.`;conflictSwap = { selected, conflict, binding };swap.hidden = false;waiting = false;return; }
    selected.bindings = [...selected.bindings.filter(value => value.startsWith('Gamepad') !== device), binding];waiting = false;save();display();
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid saved controls');
    if (Array.isArray(saved.mappings)) for (const mapping of options.mappings) {
      const value = saved.mappings.find((item: unknown) => item && typeof item === 'object' && !Array.isArray(item) && 'action' in item && item.action === mapping.action);
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      if (Array.isArray(value.bindings) && value.bindings.length <= 8 && value.bindings.every((binding: unknown): binding is string => typeof binding === 'string' && binding.length < 80)) mapping.bindings = [...value.bindings];
    }
    const savedToggles = saved.toggles && typeof saved.toggles === 'object' && !Array.isArray(saved.toggles) ? saved.toggles : {};
    toggles.keyboard = savedToggles.keyboard === true;toggles.controller = savedToggles.controller === true;
    if (typeof saved.reducedMotion === 'boolean') motion.checked = saved.reducedMotion;
    if (saved.audio && typeof saved.audio === 'object' && !Array.isArray(saved.audio)) mix.restore(saved.audio);
    if (saved?.mappings) { migrateMovementLayout({ mappings: options.mappings, defaults });migrateFlurryLayout({ mappings: options.mappings, defaults }); }
  } catch { /* Malformed preferences fall back to authored controls. */ }
  options.onReducedMotion?.(motion.checked);
  keyboardToggle.checked = toggles.keyboard;controllerToggle.checked = toggles.controller;
  advanced.onchange = () => { waiting = false;conflictSwap = undefined;swap.hidden = true;display(); };
  layout.element.onchange = () => { applyControllerLayout({ id: layout.value, mappings: options.mappings, defaults });conflictSwap = undefined;swap.hidden = true;waiting = false;latched.controller = false;save();display(); };
  swap.onclick = () => { if (!conflictSwap) return;const { selected, conflict, binding } = conflictSwap, device = binding.startsWith('Gamepad');const prior = selected.bindings.filter(value => value.startsWith('Gamepad') === device);if (!prior.length) { status.textContent = 'Selected control has no binding to exchange on this device.';return; }selected.bindings = [...selected.bindings.filter(value => value.startsWith('Gamepad') !== device), binding];conflict.bindings = [...conflict.bindings.filter(value => value.startsWith('Gamepad') !== device), ...prior];conflictSwap = undefined;swap.hidden = true;save();display(); };
  action.element.onchange = () => { conflictSwap = undefined;swap.hidden = true;display(); };remap.onclick = () => { conflictSwap = undefined;swap.hidden = true;waiting = true;status.textContent = 'Press a key or controller button. Escape cancels.'; };
  reset.onclick = () => { conflictSwap = undefined;swap.hidden = true;for (const mapping of options.mappings) mapping.bindings = [...defaults.find(item => item.action === mapping.action)!.bindings];toggles.keyboard = toggles.controller = latched.keyboard = latched.controller = false;keyboardToggle.checked = controllerToggle.checked = false;waiting = false;mix.restore({ master: options.initialAudio?.master ?? .5, sfx: options.initialAudio?.sfx ?? .5, music: options.initialAudio?.music ?? .5, ambient: options.initialAudio?.ambient ?? .5 });mix.apply();save();display(); };
  const keydown = (event: KeyboardEvent) => { if (!waiting) return;event.preventDefault();event.stopImmediatePropagation();if (event.code === 'Escape') { waiting = false;display(); } else assign(event.code); };
  root.addEventListener('keydown', event => { inputCheck.textContent = `Input detected: ${combatBindingLabel(event.code)}`;if (options.mappings.find(mapping => mapping.action === 'pause')?.bindings.includes(event.code)) event.preventDefault();else event.stopPropagation(); });
  window.addEventListener('keydown', keydown, true);options.canvas.parentElement?.append(root);display();mix.apply();
  return {
    openAudio() { root.hidden = false;settings.open('audio');const master = root.querySelector<HTMLInputElement>('input[aria-label="Master volume"]');master?.focus({ preventScroll: true });master?.scrollIntoView({ block: 'nearest' }); },
    poll(input: { bindings: ReadonlySet<string>; axes?: ArrayLike<number>; visible: boolean }) {
      if (input.visible) music?.refresh();
      if (input.axes === undefined && input.bindings.size === 0) latched.controller = false;
      if (root.hidden === input.visible) root.hidden = !input.visible;
      if (root.hidden) {
        waiting = false;
        if (action.element.getAttribute('aria-expanded') === 'true') action.close();
        if (layout.element.getAttribute('aria-expanded') === 'true') layout.close();
        settings.close();if (root.open) root.open = false;
      }
      const capturing = waiting;
      if (root.open && input.bindings.size) inputCheck.textContent = `Input detected: ${[...input.bindings].map(combatBindingLabel).join(' + ')}`;
      capturedPad = new Set([...capturedPad].filter(binding => input.bindings.has(binding)));
      if (capturing) for (const binding of input.bindings) if (binding.startsWith('Gamepad.') && !previousPad.has(binding)) { assign(binding);for (const heldBinding of input.bindings) capturedPad.add(heldBinding);break; }
      previousPad = new Set(input.bindings);
      return { bindings: capturing ? new Set<string>() : new Set([...input.bindings].filter(binding => !capturedPad.has(binding))), axes: capturing ? undefined : input.axes };
    },
    apply(input: { actions: Set<string>; keyboard: ReadonlySet<string>; gamepad: ReadonlySet<string>; active: boolean }) {
      for (const mapping of options.mappings.filter(mapping => mapping.action.endsWith(':drive'))) {
        let enabled = input.actions.has(mapping.action) && !toggles.keyboard && !toggles.controller;
        for (const device of ['keyboard', 'controller'] as const) {
          const pressed = mapping.bindings.some(binding => (device === 'keyboard' ? input.keyboard : input.gamepad).has(binding));
          if (!input.active) latched[device] = false;
          else if (toggles[device] && pressed && !held[device]) latched[device] = !latched[device];
          held[device] = pressed;enabled ||= toggles[device] ? latched[device] : pressed;
        }
        if (enabled && input.active) input.actions.add(mapping.action);else input.actions.delete(mapping.action);
      }
    },
    dispose() { action.dispose();layout.dispose();settings.dispose();window.removeEventListener('keydown', keydown, true);window.removeEventListener('blur', clearLatches);root.remove(); },
  };
}
