import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Observed evidence only: no hypothetical frame advantage or fabricated success grade. */
export function createPracticeEvidence() {
  let di = '', exchange = '', surface = '', previousId = '', previousSurface = '', preset = '', frame = -1;
  return {
    clear() { di = '';exchange = '';surface = '';previousId = '';previousSurface = '';preset = '';frame = -1; },
    observe(snapshot: GameplaySnapshot3D, definition: CombatProject3D) {
      const combat = snapshot.combat;
      if (!combat) return { di: '', exchange: '' };
      if (combat.state.frame < frame) { previousId = '';previousSurface = ''; }
      frame = combat.state.frame;
      if (preset !== combat.practice?.preset) { di = '';exchange = '';surface = '';previousId = '';previousSurface = '';preset = combat.practice?.preset ?? ''; }
      const id = definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      const pending = combat.influence?.find(row => row.id === id);
      if (pending) {
        const magnitude = Math.round(Math.min(1, Math.hypot(pending.direction.x, pending.direction.y, pending.direction.z)) * 100);
        const base = pending.base, applied = pending.applied;
        const denominator = Math.hypot(base.x, base.y, base.z) * Math.hypot(applied.x, applied.y, applied.z);
        const degrees = denominator ? Math.acos(Math.max(-1, Math.min(1, (base.x * applied.x + base.y * applied.y + base.z * applied.z) / denominator))) * 180 / Math.PI : 0;
        di = `Stick ${magnitude}% · launch rotated ${degrees.toFixed(1)}°`;
      }
      let latest: (typeof combat.exchange)[number] | undefined, contact: (typeof combat.exchange)[number] | undefined;
      for (const entry of combat.exchange ?? []) {
        if (entry.moveId) latest = entry;
        if (entry.kind === 'bounce' || entry.kind === 'tech') contact = entry;
      }
      if (latest && latest.id !== previousId) {
        previousId = latest.id;
        const target = combat.state.fighters.find(fighter => fighter.id === latest.targetId);
        const move = definition.config.moves.find(move => move.id === latest.moveId);
        exchange = `Last attack contact F${latest.frame}: ${latest.kind} · ${latest.moveId} · ${Number(latest.damage.toFixed(2))} damage${target?.stunFrames ? ` · observed ${target.stunFrames}f ${target.stunKind} stun` : ''}${move ? `\nMove timing ${move.startupFrames}/${move.activeFrames}/${move.recoveryFrames}f (startup/active/recovery)` : ''}`;
      }
      if (contact && contact.id !== previousSurface) {
        previousSurface = contact.id;
        surface = `Last surface contact F${contact.frame}: ${contact.kind === 'tech' ? 'timed recovery' : 'bounce'} · ${Number(contact.damage.toFixed(2))} damage`;
      }
      return { di: `${di || 'Let the launcher hit, then steer.'}${pending ? combat.hitstop.remaining ? ' · steering open during hitstop' : ` · ${pending.remaining} resumed frames remain` : di ? ' · last observed; steering window closed' : ''}`, exchange: [exchange, surface].filter(Boolean).join('\n') };
    },
  };
}
