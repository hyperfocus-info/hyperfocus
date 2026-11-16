import { combatActionLabel, combatBindingLabel } from '../control-hint';

/** Keep observed frame/order evidence, but speak in the player's controls. */
export function practiceInputLabel(options: { input: string; mappings: readonly { action: string; bindings: readonly string[] }[]; controller?: boolean }) {
  const [buttons, direction] = options.input.split(' | ');
  const labels = buttons!.split(' + ').map(action => {
    if (action === 'neutral') return 'Released';
    const binding = options.mappings.find(mapping => mapping.action === action)?.bindings.find(binding => binding.startsWith('Gamepad') === !!options.controller);
    return `${binding ? `${combatBindingLabel(binding)} · ` : ''}${combatActionLabel(action)}`;
  });
  return labels.join(' + ') + (direction && !direction.startsWith('stick 0%') ? `\n${direction}` : '');
}
