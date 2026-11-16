const core = ['jab', 'heavy', 'jump', 'dash', 'guard', 'drive', 'escape', 'feint'] as const;
export const controllerLayouts = [
  { id: 'balanced', name: 'Balanced', description: 'Square / Triangle attack; Cross jumps; Circle steps / sprints; L1 guards; R2 drives.', buttons: [2, 3, 0, 1, 4, 7, 6, 5] },
  { id: 'shoulder-attacks', name: 'Shoulder attacks', description: 'R1 / R2 attack while your thumb keeps jump and movement.', buttons: [5, 7, 0, 1, 4, 6, 3, 2] },
  { id: 'trigger-attacks', name: 'Trigger attacks', description: 'R2 strikes and L2 hits heavy; R1 drives; L1 guards.', buttons: [7, 6, 0, 1, 4, 5, 3, 2] },
  { id: 'trigger-guard', name: 'Trigger guard', description: 'Hold L2 to guard, R2 to drive. L1 is your escape.', buttons: [2, 3, 0, 1, 6, 7, 4, 5] },
  { id: 'right-guard', name: 'Right guard', description: 'R1 guard and R2 Drive keep defense on one hand.', buttons: [2, 3, 0, 1, 5, 7, 6, 4] },
  { id: 'face-guard', name: 'Face guard', description: 'Circle guards and R1 steps / sprints; Square / Triangle attack.', buttons: [2, 3, 0, 5, 1, 7, 6, 4] },
  { id: 'shoulder-movement', name: 'Shoulder movement', description: 'L1 jumps and R1 steps / sprints; face buttons focus on attacks.', buttons: [2, 3, 4, 5, 6, 7, 1, 0] },
  { id: 'shoulder-core', name: 'Shoulder core', description: 'Jump L1, movement L2, strike R1, heavy R2. Cross guards.', buttons: [5, 7, 4, 6, 0, 1, 3, 2] },
  { id: 'classic-face', name: 'Classic face', description: 'Cross / Circle attack; Square jumps; Triangle steps / sprints.', buttons: [0, 1, 2, 3, 4, 7, 6, 5] },
  { id: 'left-attacks', name: 'Left attacks', description: 'L1 / L2 attack; R1 guards and R2 drives.', buttons: [4, 6, 0, 1, 5, 7, 3, 2] },
] as const;
type Mapping = { action: string; bindings: string[] };
export function applyControllerLayout(options: { id: string; mappings: Mapping[]; defaults?: readonly Mapping[] }) {
  const layout = controllerLayouts.find(item => item.id === options.id);if (!layout) return;
  for (const mapping of options.mappings) {
    const authored = options.defaults?.find(item => item.action === mapping.action);
    if (authored) mapping.bindings = [...mapping.bindings.filter(binding => !binding.startsWith('Gamepad')), ...authored.bindings.filter(binding => binding.startsWith('Gamepad'))];
    if (mapping.action.endsWith(':tech') || mapping.action.endsWith(':flurry')) { mapping.bindings = mapping.bindings.filter(binding => !binding.startsWith('Gamepad'));continue; }
    const index = core.findIndex(name => mapping.action.endsWith(`:${name}`));
    const extras: Record<string, number> = { evade: 10, lockon: 11, reset: 8, followup: 12, sidestep: 14, evasive: 15 };
    const button = index >= 0 ? layout.buttons[index] : mapping.action === 'pause' ? 9 : mapping.action === 'match:start' ? 0 : mapping.action === 'match:menu' ? 1 : extras[mapping.action.replace(/^.*:/, '')];
    if (button === undefined) continue;
    mapping.bindings = [...mapping.bindings.filter(binding => !binding.startsWith('Gamepad')), `Gamepad.Button${button}`];
  }
}
export function selectedControllerLayout(mappings: readonly Mapping[]) {
  return controllerLayouts.find(layout => core.every((name, index) => {
    const mapping = mappings.find(item => item.action.endsWith(`:${name}`));
    return !!mapping && mapping.bindings.filter(binding => binding.startsWith('Gamepad')).join() === `Gamepad.Button${layout.buttons[index]}`;
  }) && mappings.every(mapping => {
    const extras: Record<string, number> = { evade: 10, lockon: 11, reset: 8, followup: 12, sidestep: 14, evasive: 15 };
    const name = mapping.action.replace(/^.*:/, ''), binding = mapping.bindings.filter(value => value.startsWith('Gamepad')).join();
    if (name === 'tech' || name === 'flurry') return !binding;
    const button = mapping.action === 'pause' ? 9 : extras[name];return button === undefined || binding === `Gamepad.Button${button}`;
  }))?.id ?? 'custom';
}

/** Upgrade only an untouched named legacy layout; deliberate custom remaps stay intact. */
export function migrateFlurryLayout(options: { mappings: Mapping[]; defaults: readonly Mapping[] }) {
  if (customAuxiliaryBinding(options)) return;
  if (!options.defaults.some(mapping => mapping.action.endsWith(':feint') && mapping.bindings.includes('Gamepad.Button5'))
    || options.defaults.some(mapping => mapping.action.endsWith(':flurry') && mapping.bindings.some(binding => binding.startsWith('Gamepad')))) return;
  const feint = options.mappings.find(mapping => mapping.action.endsWith(':feint'));
  if (feint?.bindings.filter(binding => binding.startsWith('Gamepad')).join() !== 'Gamepad.Button13') return;
  const legacy = options.mappings.filter(mapping => !mapping.action.endsWith(':feint')).map(mapping => ({ ...mapping, action: mapping.action.replace(/:flurry$/, ':feint') }));
  const id = selectedControllerLayout(legacy) === 'custom' ? legacyMovementLayout(legacy) : selectedControllerLayout(legacy);
  if (id !== 'custom') applyControllerLayout({ ...options, id });
}

function legacyMovementLayout(mappings: readonly Mapping[]) {
  return selectedControllerLayout(mappings.map(mapping => ({ ...mapping, action: mapping.action.endsWith(':evade') ? mapping.action.replace(/:evade$/, ':dash') : mapping.action.replace(/:dash$/, ':evade') })));
}

/** Named presets migrate; a single deliberately customized controller binding prevents migration. */
export function migrateMovementLayout(options: { mappings: Mapping[]; defaults: readonly Mapping[] }) {
  if (customAuxiliaryBinding(options)) return;
  if (!options.defaults.some(mapping => mapping.action.endsWith(':dash') && mapping.bindings.includes('Gamepad.Button1'))
    || !options.defaults.some(mapping => mapping.action.endsWith(':evade') && mapping.bindings.includes('Gamepad.Button10'))) return;
  const id = legacyMovementLayout(options.mappings);
  if (id !== 'custom') applyControllerLayout({ ...options, id });
}

function customAuxiliaryBinding(options: { mappings: readonly Mapping[]; defaults: readonly Mapping[] }) {
  const owned = new Set<string>([...core, 'evade', 'flurry', 'tech', 'lockon', 'reset', 'followup', 'sidestep', 'evasive']);
  return options.mappings.some(mapping => {
    if (owned.has(mapping.action.replace(/^.*:/, '')) || mapping.action === 'pause') return false;
    const authored = options.defaults.find(item => item.action === mapping.action);
    return !!authored && mapping.bindings.filter(binding => binding.startsWith('Gamepad')).join() !== authored.bindings.filter(binding => binding.startsWith('Gamepad')).join();
  });
}
