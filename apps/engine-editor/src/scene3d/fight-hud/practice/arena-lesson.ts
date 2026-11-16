import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Optional practice coaching observes real interactions, never grants success or changes physics. */
export function createArenaLessonGuidance() {
  let active = false, lastFrame = -1, picked = false, worn = false, thrown = false, cracked = false, broken = false;
  return {
    text(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D; keys: { interact: string; jab: string; heavy: string; reset: string } }) {
      const combat = options.snapshot.combat, frame = combat?.state.frame ?? -1;
      const next = combat?.match?.phase === 'practice' && combat.practice.preset === 'arena-lesson';
      if (!next || !active || frame < lastFrame) picked = worn = thrown = cracked = broken = false;
      active = next;lastFrame = frame;if (!next || !combat) return '';
      const player = options.definition.fighters.find(fighter => fighter.control === 'player')?.entityId;
      if (!player) return '';
      for (const event of combat.interactions?.trace ?? []) {
        if (event.actor !== player) continue;
        picked ||= event.kind === 'weapon-picked-up';
        worn ||= ['weapon-wear', 'weapon-shortened', 'weapon-broken'].includes(event.kind);
        thrown ||= event.kind === 'weapon-thrown';
      }
      for (const event of combat.environment?.trace ?? []) {
        if (event.actor !== player || event.cause !== 'impact') continue;
        cracked ||= event.kind === 'warning';broken ||= event.kind === 'removed';
      }
      const { interact, jab, heavy, reset } = options.keys;
      const held = combat.interactions?.weapons.find(weapon => weapon.owner === player);
      if (!picked) return `Arena tools · 1 / 4\nFind a nearby loose object. Follow its pickup prompt, move within reach, then ${interact} to pick up. The dummy waits while you explore.`;
      if (!worn) return `Arena tools · 2 / 4\n${held ? `${jab} / ${heavy} now use your held tool.` : `Pick the tool up again with ${interact}.`} Watch its use count. Dedicated weapons wear; fragile props are spent once. Spray tools bash with ${jab} and spend a charge with ${heavy}.`;
      if (!thrown) return `Arena tools · 3 / 4\n${held ? `${interact} throws your tool toward the opponent.` : `Pick up a usable tool, then ${interact} again to throw.`} Both fighters can parry incoming tools. Wood can break shorter and lose reach.`;
      if (!broken) {
        const fighter = combat.state.fighters.find(fighter => fighter.id === player)!;
        const removed = new Set(combat.environment?.surfaces.filter(surface => surface.phase === 'removed').map(surface => surface.entityId));
        const targets = new Set(options.definition.environment?.surfaces.filter(surface => surface.trigger.kind === 'impact' && !removed.has(surface.entityId)).map(surface => surface.entityId));
        let nearest: GameplaySnapshot3D['entities'][number] | undefined, distance = Infinity;
        for (const entity of options.snapshot.entities) {
          if (!targets.has(entity.id)) continue;
          const nextDistance = (entity.position[0] - fighter.position.x) ** 2 + (entity.position[1] - fighter.position.y) ** 2 + (entity.position[2] - fighter.position.z) ** 2;
          if (nextDistance < distance) { nearest = entity;distance = nextDistance; }
        }
        const kind = nearest && ['barrel', 'crate', 'bench', 'table', 'ladder', 'column', 'statue'].find(kind => nearest.id.includes(`:${kind}:`));
        return `Arena tools · 4 / 4\n${cracked ? 'Your impact cracked a surface. Hit it again to finish breaking it.' : `Try ${heavy} against ${kind ? `a nearby ${kind}` : 'a cracked panel or wooden prop'}. You can damage it directly without hitting a fighter through it.`}\nBroken surfaces stay changed through the match. Read the opening they leave.`;
      }
      return `Arena tools complete\nYou picked up, wore and threw a tool, then broke terrain. Use those changes in a real exchange. ${reset} resets this practice space.`;
    },
  };
}
