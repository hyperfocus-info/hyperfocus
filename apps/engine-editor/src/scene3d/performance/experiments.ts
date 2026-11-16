import { createGameSections, createGameSelect, gameSelectStyles } from '@hyperfocus/ui/game-menu';

export type HudLayoutStrategy = 'original' | 'batched' | 'post-first';
export const defaultHudLayout: HudLayoutStrategy = 'post-first';
const suspendedHudLayout: HudLayoutStrategy = 'original';
export function parseHudLayout(value: unknown): HudLayoutStrategy {
  if (value !== 'original' && value !== 'batched' && value !== 'post-first') throw Error(`Unsupported HUD layout strategy: ${String(value)}`);
  return value;
}

const defaults = { scene: true, shadows: true, outlines: true, lighting: true, materialFeatures: true, shadowSampling: true, cameraCulling: true, post: true, effects: true, hud: true, renderFighters: true, renderEnvironment: true, simulation: true, ai: true, combat: true, mainPhysics: true, koPhysics: true, environmentMotion: true, traffic: true, hazards: true };
type Flag = keyof typeof defaults;
const simulationKeys = ['simulation', 'ai', 'combat', 'mainPhysics', 'koPhysics', 'environmentMotion', 'traffic', 'hazards'] as const;
const rows: Array<[Flag, string, string]> = [
  ['scene', 'Scene submission', 'Off clears the scene while menus remain available.'],
  ['shadows', 'Shadows', 'Draw directional shadows.'],
  ['outlines', 'Outlines', 'Draw the outline pass.'],
  ['lighting', 'Material lighting', 'Shade materials using scene lights.'],
  ['materialFeatures', 'Expensive material features', 'Use cutaways and normal, roughness, occlusion, and emissive maps.'],
  ['shadowSampling', 'Receiver shadow sampling', 'Sample shadows on surfaces; shadow production is controlled separately.'],
  ['cameraCulling', 'Camera culling', 'Omit geometry outside the camera view. Shadow casters remain available.'],
  ['post', 'Post-processing', 'Apply bloom, vignette, exposure, and combat screen effects.'],
  ['effects', 'Visible particles and VFX', 'Show effect geometry and impact overlays. Effect simulation continues.'],
  ['hud', 'Fight HUD', 'Show fighter bars and combat readouts. Pause and settings remain available.'],
  ['renderFighters', 'Render fighters', 'Show fighters and their attached presentation geometry.'],
  ['renderEnvironment', 'Render environment', 'Show scenery and other world geometry. Collisions remain active.'],
  ['simulation', 'Run simulation', 'Advance the local fight. Off freezes the world; menu commands remain available.'],
  ['ai', 'AI decisions', 'Let computer fighters choose actions.'],
  ['combat', 'Combat solver', 'Advance strike resolution and the combat state clock.'],
  ['mainPhysics', 'Main physics', 'Step the main rigid-body world.'],
  ['koPhysics', 'KO physics', 'Step knocked-out fighter rigs.'],
  ['environmentMotion', 'Environment updates', 'Advance authored scenery motion and environment events.'],
  ['traffic', 'Traffic contacts', 'Resolve moving-vehicle contacts with fighters.'],
  ['hazards', 'Hazard contacts', 'Resolve environmental damage and hazard contacts.'],
];

/** Device preferences belong to the host; effective flags are isolated from remote/replay worlds. */
export function createGameExperiments(options: { storageKey?: string; onChange(flags: typeof defaults): void }) {
  const key = options.storageKey ?? `hf-game-experiments:${location.pathname}`;
  const requested = { ...defaults }, flags = { ...defaults };
  let resolution = 1, allowed = true, tainted = false;
  let hudLayout: HudLayoutStrategy = defaultHudLayout;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const [name] of rows) if (typeof saved[name] === 'boolean') requested[name] = saved[name];
      if ([0.5, 0.75, 1].includes(saved.resolution)) resolution = saved.resolution;
      if (saved.hudLayout !== undefined) hudLayout = parseHudLayout(saved.hudLayout);
    }
  } catch { /* Unavailable preferences use normal rendering and simulation. */ }
  const section = document.createElement('details'), summary = document.createElement('summary');
  summary.textContent = 'Experimental match controls';section.className = 'hf-match-experiments';section.append(summary);
  const note = document.createElement('p');note.textContent = 'Changes apply to this local match immediately. Simulation changes exclude this session from saved AI learning and rewards.';section.append(note);
  const status = document.createElement('p');status.setAttribute('role', 'status');section.append(status);
  const style = document.createElement('style');style.textContent = gameSelectStyles + '.hf-match-experiments>summary{min-height:44px;cursor:pointer;padding:12px 0}.hf-match-experiments .hf-experiment-row{padding:8px 0;border-bottom:1px solid var(--game-line,#eee9dc36)}.hf-match-experiments .hf-experiment-row p{font-size:.875rem!important}.hf-match-experiments button{min-height:44px}.hf-match-experiments [role=tabpanel]{min-height:0!important}';section.append(style);
  const inputs = new Map<Flag, HTMLInputElement>();
  const panels = createGameSections({ parent: section, label: 'Experimental match subsystems', sections: ['Rendering', 'Simulation'].map(group => {
    const content = document.createElement('div');
    for (const [name, title, description] of rows.filter(([name]) => simulationKeys.some(key => key === name) === (group === 'Simulation'))) {
      const row = document.createElement('div'), label = document.createElement('label'), input = document.createElement('input'), help = document.createElement('p');
      row.className = 'hf-experiment-row';input.type = 'checkbox';input.checked = requested[name];input.setAttribute('aria-label', title);
      help.id = `hf-experiment-${name}`;help.textContent = description;input.setAttribute('aria-describedby', help.id);
      input.onchange = () => { requested[name] = input.checked;apply();save(); };
      inputs.set(name, input);label.append(input, title);row.append(label, help);content.append(row);
    }
    section.append(content);return { id: group.toLowerCase(), label: group, content };
  }) });
  const scaleButton = document.createElement('button');scaleButton.type = 'button';section.append(scaleButton);
  const scale = createGameSelect({ element: scaleButton, ariaLabel: 'Render resolution', value: String(resolution), options: [{ value: '1', label: '100% resolution' }, { value: '0.75', label: '75% resolution' }, { value: '0.5', label: '50% resolution' }] });
  scaleButton.addEventListener('change', () => { resolution = Number(scale.value);save(); });
  const hudButton = document.createElement('button');hudButton.type = 'button';section.append(hudButton);
  const hud = createGameSelect({ element: hudButton, ariaLabel: 'HUD layout work', value: hudLayout, options: [{ value: 'original', label: 'Original HUD layout' }, { value: 'batched', label: 'Shared geometry and changed writes' }, { value: 'post-first', label: 'Post-processing before HUD writes' }] });
  const setHudLayout = (value: HudLayoutStrategy) => { hudLayout = parseHudLayout(value);hud.value = hudLayout;save(); };
  hudButton.addEventListener('change', () => setHudLayout(parseHudLayout(hud.value)));
  const reset = document.createElement('button');reset.type = 'button';reset.textContent = 'Reset experimental controls';section.append(reset);
  reset.onclick = () => { Object.assign(requested, defaults);resolution = 1;scale.value = '1';hudLayout = defaultHudLayout;hud.value = hudLayout;for (const [name, input] of inputs) input.checked = requested[name];apply();save(); };
  function apply() {
    Object.assign(flags, allowed ? requested : defaults);
    if (simulationKeys.some(name => !flags[name])) tainted = true;
    options.onChange(flags);
    status.textContent = !allowed ? 'Experimental controls are suspended during online play, replay, guided practice, or worker playback.' : tainted ? 'Simulation was changed. Saved learning and rewards are disabled until the game is reloaded.' : 'Controls apply to the current local match.';
  }
  function save() { try { localStorage.setItem(key, JSON.stringify({ ...requested, resolution, hudLayout })); } catch { status.textContent = 'Controls apply this session; local storage is unavailable.'; } }
  apply();
  return {
    section, flags,
    get resolution() { return allowed ? resolution : 1; },
    get hudLayout() { return allowed ? hudLayout : suspendedHudLayout; },
    setHudLayout,
    get tainted() { return tainted; },
    allow(value: boolean) { if (value === allowed) return;allowed = value;for (const input of inputs.values()) input.disabled = !value;scaleButton.disabled = !value;hudButton.disabled = !value;reset.disabled = !value;apply(); },
    snapshot() { return { requested: { ...requested, resolution, hudLayout }, effective: { ...flags, resolution: allowed ? resolution : 1, hudLayout: allowed ? hudLayout : suspendedHudLayout }, allowed, tainted }; },
    dispose() { panels.dispose();scale.dispose();hud.dispose();section.remove(); },
  };
}
