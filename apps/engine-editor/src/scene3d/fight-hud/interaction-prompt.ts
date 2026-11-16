import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { combatBindingLabel } from './control-hint.ts';
import { projectPracticePoint } from './practice/practice-volumes.ts';

function toolName(id: string, definition: CombatProject3D) {
  const weapon = definition.interactions?.weapons.find(item => item.entityId === id), material = weapon?.material;
  if (weapon?.name) return weapon.name;
  return id.includes('timber-brace') ? 'Timber brace' : id.includes('handrail') ? 'Detached handrail' : material === 'wood' ? 'Wooden tool' : 'Metal tool';
}

export function interactionPrompt(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D; mappings: readonly { action: string; bindings: readonly string[] }[]; controller?: boolean; localFighterId?: string; interactionTargets?: Record<string, string> }) {
  const { snapshot, definition } = options;
  const player = definition.fighters.find(fighter => fighter.entityId === options.localFighterId) ?? definition.fighters.find(fighter => fighter.control === 'player');
  const state = snapshot.combat, interactions = state?.interactions;
  if (!definition.interactions || !player || !state || state.match?.theater || !interactions || !['practice', 'fighting'].includes(state.match?.phase ?? '')) return '';
  const actionKey = (action: string) => options.mappings.find(mapping => mapping.action === `${definition.fighters.find(fighter => fighter.control === 'player')?.actionPrefix}${action}`)?.bindings.find(value => value.startsWith('Gamepad') === Boolean(options.controller));
  const binding = actionKey('interact');
  const key = binding ? combatBindingLabel(binding) : 'Bind Grab in Game settings';
  if (interactions.grapples.some(grapple => grapple.target === player.entityId)) return `${key} · Break this grab`;
  if (interactions.grapples.some(grapple => grapple.attacker === player.entityId)) return 'Grab connected · Throw pending';
  const held = interactions.weapons.find(weapon => weapon.active !== false && weapon.owner === player.entityId);
  if (held) {
    const weapon = definition.interactions.weapons.find(weapon => weapon.entityId === held.id);
    const light = actionKey('jab'), heavy = actionKey('heavy');
    if (weapon?.kit === 'spray') return `${key} · Throw ${toolName(held.id, definition)} · ${light ? combatBindingLabel(light) : 'Light'} bash / ${heavy ? combatBindingLabel(heavy) : 'Heavy'} spray · ${held.ammo ?? weapon.ammo ?? 0} charges`;
    if (weapon?.kit === 'single-use' || weapon?.kit === 'ground') return `${key} · Throw ${toolName(held.id, definition)} · ${light ? combatBindingLabel(light) : 'Attack'} ${weapon.kit === 'ground' ? 'deploy' : 'use'} · One use`;
    const attacks = ['jab', 'heavy'].map(action => actionKey(action)).filter((value): value is string => Boolean(value)).map(combatBindingLabel);
    return `${key} · Throw ${toolName(held.id, definition)}${attacks.length ? ` · ${attacks.join(' / ')} attack` : ''} · ${Math.ceil(held.durability)} durability`;
  }
  const selected = options.interactionTargets?.[player.entityId];
  if (selected && interactions.weapons.some(item => item.id === selected && item.active !== false && !item.owner && !item.projectileOwner && item.durability > 0)) return `${key} · Pick up ${toolName(selected, definition)}`;
  if (selected && state.state.fighters.some(fighter => fighter.id === selected)) return `${key} · Grab opponent`;
  let failure: (typeof interactions.trace)[number] | undefined;
  for (let index = interactions.trace.length - 1; index >= 0; index--) {
    const event = interactions.trace[index]!;
    if (event.kind === 'grapple-tech' && (event.actor === player.entityId || event.target === player.entityId) && state.state.frame - event.frame >= 0 && state.state.frame - event.frame < 90) return 'Throw broken';
    if (event.actor === player.entityId && ['grapple-out-of-range', 'grapple-facing-away', 'grapple-obstructed', 'interaction-recovering'].includes(event.kind)) { failure = event;break; }
  }
  if (failure && state.state.frame - failure.frame >= 0 && state.state.frame - failure.frame < 90) {
    const reason: Record<string, string> = { 'grapple-out-of-range': 'Move closer to grab', 'grapple-facing-away': 'Face the opponent to grab', 'grapple-obstructed': 'An obstacle blocks the grab', 'interaction-recovering': 'Finish recovering before grabbing' };
    return `${key} · ${reason[failure.kind]}`;
  }
  const fighter = state.state.fighters?.find(fighter => fighter.id === player.entityId);
  if (fighter && !fighter.stunFrames && !fighter.moveId) {
    const nearby = interactions.weapons.filter(item => item.active !== false && !item.owner && !item.projectileOwner && item.durability > 0)
      .map(item => ({ item, distance: Math.hypot(item.position.x - fighter.position.x, item.position.y - fighter.position.y, item.position.z - fighter.position.z) }))
      .filter(value => value.distance <= 3.5).sort((a, b) => a.distance - b.distance)[0]?.item;
    if (nearby) {
      const name = toolName(nearby.id, definition);
      // This is discovery guidance, not a second targeting implementation. The
      // actual press still resolves stick intent, facing, range and obstruction.
      return `${name} nearby · Move toward it + ${key} to pick up`;
    }
  }
  return `Move within reach · ${key} grabs an opponent or picks up a tool`;
}

export function createInteractionPrompt(options: { canvas: HTMLCanvasElement; definition: CombatProject3D; mappings: readonly { action: string; bindings: readonly string[] }[] }) {
  const element = document.createElement('p');element.className = 'hf-interaction-prompt';element.hidden = true;element.setAttribute('role', 'status');element.setAttribute('aria-label', 'Grab control');options.canvas.parentElement?.append(element);
  const marker = document.createElement('span');marker.className = 'hf-pickup-target';marker.hidden = true;marker.setAttribute('aria-hidden', 'true');options.canvas.parentElement?.append(marker);
  return {
    render(input: { snapshot: GameplaySnapshot3D; hidden?: boolean; controller?: boolean; localFighterId?: string; interactionTargets?: Record<string, string>; matrix?: ArrayLike<number> }) {
      const text = input.hidden ? '' : interactionPrompt({ ...options, ...input });element.hidden = !text;
      if (element.textContent !== text) element.textContent = text;
      const player = input.localFighterId ?? options.definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      const target = player ? input.interactionTargets?.[player] : undefined;
      const item = input.snapshot.combat?.interactions?.weapons.find(item => item.id === target && item.active !== false && !item.owner && !item.projectileOwner && item.durability > 0);
      element.toggleAttribute('data-selected-target', !!item && !input.hidden);
      const point = item && input.matrix ? projectPracticePoint([item.position.x, item.position.y + .15, item.position.z], input.matrix, options.canvas.clientWidth, options.canvas.clientHeight) : undefined;
      marker.hidden = !text || !point;
      if (point) { marker.style.left = `${point.x}px`;marker.style.top = `${point.y}px`;marker.dataset.targetId = item!.id; }
    },
    dispose() { element.remove();marker.remove(); },
  };
}
