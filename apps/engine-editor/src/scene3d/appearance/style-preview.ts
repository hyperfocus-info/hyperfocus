import { applyAppearanceMotion3D, createCombatRoundRecovery3D, type Hyperfocus3DEvaluatedFrame, type ResolvedAppearance3D } from '@hyperfocus/engine/project/runtime-3d';
import type { CombatSnapshot } from '@hyperfocus/engine/combat';

/** Detached demonstration only: no inputs, events, clocks or saves are advanced. */
export function previewAppearanceStyle(options: { frame: Hyperfocus3DEvaluatedFrame; resolved: ResolvedAppearance3D; state: CombatSnapshot; actorId: string; channel: 'movement' | 'hit' | 'particles' | 'recovery'; progress: number; reducedMotion: boolean }) {
  const { frame, actorId, channel, progress } = options, state = structuredClone(options.state);
  const fighter = state.fighters.find(fighter => fighter.id === actorId), root = frame.entities.find(entity => entity.id === actorId);
  if (!fighter || !root) return;
  if (channel === 'recovery') {
    fighter.health = 0;
    createCombatRoundRecovery3D()({ frame, state, ticks: 90 * (1 - progress), winnerId: '', targets: new Map([[actorId, { x: root.position[0], y: root.position[1], z: root.position[2] }]]), styles: options.resolved.styles, reducedMotion: options.reducedMotion });
    return;
  }
  fighter.health = Math.max(1, fighter.health);fighter.moveId = '';fighter.guarding = false;
  fighter.stunKind = channel === 'hit' ? 'hit' : '';fighter.stunFrames = channel === 'hit' ? Math.round((1 - progress) * 18) : 0;
  if (channel === 'particles') for (let index = 0; index < 4; index++) {
    const trail = frame.entities.find(entity => entity.id === `${actorId}:trail:${index}`);if (!trail) continue;
    const age = options.reducedMotion ? .35 : (progress + index / 4) % 1;
    const size = .16 * (1 - age);
    trail.position = [root.position[0] + (index - 1.5) * .25, root.position[1] - .7 + age * .3, root.position[2] + .5];
    trail.scale = [size, size * .45, size];trail.visible = true;
  }
  applyAppearanceMotion3D({ frame, state, resolved: { ...options.resolved, styles: options.resolved.styles?.filter(style => style.channel === channel) }, reducedMotion: options.reducedMotion });
}
