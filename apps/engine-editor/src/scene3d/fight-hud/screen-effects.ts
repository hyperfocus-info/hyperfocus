import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';
import { presentedFighterResources } from './recovery-resources.ts';

export type CombatScreenEffects = { danger: number; blur: number; exhaustion?: number; frame: number; reducedMotion: boolean };

export function combatScreenEffects(options: { snapshot: GameplaySnapshot3D; definition?: CombatProject3D; reducedMotion?: boolean; localFighterId?: string; spectating?: boolean }): CombatScreenEffects {
  const { snapshot, definition, reducedMotion = false } = options;
  // Spectators have no local body: neither fighter's injuries or fatigue tint
  // their view, including during round recovery and saved Theater playback.
  if (options.spectating || snapshot.combat?.match?.theater) return { danger: 0, blur: 0, exhaustion: 0, frame: snapshot.combat?.state.frame ?? 0, reducedMotion };
  const id = options.localFighterId ?? definition?.fighters.find(f => f.control === 'player')?.entityId;
  const fighter = snapshot.combat?.state.fighters.find(f => f.id === id);
  const phase = snapshot.combat?.match?.phase;
  const live = !phase || phase === 'fighting' || phase === 'round-result' || phase === 'practice';
  const velocity = snapshot.gameplay?.velocities.find(v => v.id === id)?.value ?? [0, 0, 0];
  const speed = Math.hypot(...velocity);
  const resources = fighter && presentedFighterResources({ snapshot, definition, fighter });
  const damage = resources ? 1 - resources.health / (definition?.config.maxHealth ?? 100) : 0;
  const exhaustion = resources && live ? Math.max(0, Math.min(1, 1 - resources.stamina / (definition?.config.maxStamina ?? 100))) : 0;
  // Keep the critical (<25% stamina) curve intact; ease to 20% less grayscale
  // across 25–35% so crossing the critical boundary never produces a jump.
  const relief = Math.max(0, Math.min(1, (0.75 - exhaustion) / 0.1));
  return { frame: snapshot.combat?.state.frame ?? 0, reducedMotion,
    danger: fighter && live ? Math.max(0, Math.min(3, damage <= .6 ? damage / .6 : 1 + (damage - .6) / .39 * 2)) : 0,
    exhaustion: exhaustion * (1 - .2 * relief * relief * (3 - 2 * relief)),
    blur: fighter && live && !reducedMotion ? Math.min(1, Math.max(0, (speed - 4) / 10) + exhaustion * .2) * (1 - (resources?.progress ?? 0)) : 0 };
}

/** Translucent peripheral damage marks leave the central fight and HUD unobscured. */
export function drawCombatScreenEffects(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, effect: CombatScreenEffects) {
  context.save();context.globalCompositeOperation = 'source-over';
  if (effect.blur > 0) {
    context.globalAlpha = effect.blur * .13;
    context.filter = `grayscale(${(effect.exhaustion ?? 0) * 100}%) blur(${effect.blur * 4}px)`;
    const smear = effect.blur * 22;
    context.drawImage(source, -smear, -smear * .35, width + smear * 2, height + smear * .7);
    context.drawImage(source, -smear * .5, -smear * .175, width + smear, height + smear * .35);
    context.filter = 'none';
  }
  if (effect.danger > 0) {
    const pulse = effect.reducedMotion ? 1 : .9 + .1 * Math.sin(effect.frame / 14);
    const alpha = Math.min(.94, effect.danger * .42 * pulse);
    if (!effect.reducedMotion) {
      context.globalAlpha = Math.min(.28, effect.danger * .09);
      context.filter = `grayscale(${(effect.exhaustion ?? 0) * 100}%) blur(${effect.danger * (.25 + .25 * pulse)}px)`;
      context.drawImage(source, 0, 0, width, height);context.filter = 'none';
    }
    context.globalAlpha = 1;
    context.fillStyle = `rgba(145,0,12,${effect.danger * .025 * pulse})`;context.fillRect(0, 0, width, height);
    const edge = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .30, width / 2, height / 2, Math.hypot(width, height) * .57);
    edge.addColorStop(0, 'rgba(110,0,9,0)');edge.addColorStop(.6, `rgba(135,0,14,${alpha * .3})`);edge.addColorStop(1, `rgba(170,0,18,${alpha})`);
    context.fillStyle = edge;context.fillRect(0, 0, width, height);
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0, x = left ? width * (.005 + (i % 3) * .016) : width * (.995 - (i % 3) * .016);
      const y = height * (.07 + ((i * 7) % 11) * .085), radius = Math.min(width, height) * (.07 + (i % 3) * .025);
      const blotch = context.createRadialGradient(x, y, radius * .08, x, y, radius);
      blotch.addColorStop(0, `rgba(105,0,8,${alpha * .95})`);blotch.addColorStop(.45, `rgba(155,3,19,${alpha * .6})`);blotch.addColorStop(1, 'rgba(135,0,15,0)');
      context.fillStyle = blotch;context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  context.restore();
}
