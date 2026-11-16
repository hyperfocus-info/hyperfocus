import type { CombatProject3D, GameplaySnapshot3D } from '@hyperfocus/engine/project/runtime-3d';

/** Bounded read-only projection of recorded physical state; no inferred combat outcomes. */
export function practicePhysicalLines(options: { snapshot: GameplaySnapshot3D; definition: CombatProject3D }): string[] {
  const combat = options.snapshot.combat, environment = combat?.environment;
  const stops = environment?.vehicleStops?.slice(-8).map(stop => `${stop.entityId}: motion stopped by ${stop.cause}${stop.blockerId ? ` | blocker ${stop.blockerId}` : ''} | solid collider retained`) ?? [];
  const hazards = environment?.hazards;
  const contacts = hazards?.contacts.slice(-8).map(contact => {
    const rule = options.definition.environment?.hazards?.find(item => item.entityId === contact.entityId);
    const cadence = rule?.kind === 'fire' ? ` | cadence ${rule.intervalFrames}f | damage eligible from F${contact.nextDamageFrame} (contact and protection checked)` : rule?.kind === 'flood' ? ` | grounded movement x${rule.groundSpeedScale}` : '';
    return `${contact.entityId} -> ${contact.fighterId}: ${contact.active ? 'inside' : 'outside'}${cadence}`;
  }) ?? [];
  const hazardTrace = hazards?.trace.slice(-12).map(event => `F${event.frame} ${event.entityId} -> ${event.fighterId}: ${event.kind}${event.kind === 'damage' ? ` ${event.damage} health` : ''}`) ?? [];
  const changes = environment?.trace.slice(-8).map(event => `F${event.frame} ${event.entityId}: ${event.kind} from ${event.cause}${event.actor ? ` (${event.actor}, ${event.speed.toFixed(1)} m/s)` : ''}`) ?? [];
  const surfaces = environment?.surfaces.slice(-8).map(surface => `${surface.entityId}: ${surface.phase}`) ?? [];
  const objects = combat?.interactions?.weapons.slice(-8).map(item => `${item.id}: ${item.owner || item.projectileOwner && 'thrown' || 'on surface'} | durability ${item.durability} | reach ${item.length.toFixed(2)}m`) ?? [];
  const traversal = combat?.motion.slice(-4).map(item => `${item.id}: wall ${item.wallId || 'none'} | ${item.wallRunning ? 'running' : 'released'} | ${item.wallRunTicks} frames`) ?? [];
  const events = combat?.interactions?.trace.slice(-12).map(event => `F${event.frame} ${event.actor} -> ${event.target}: ${event.kind} (${event.value})`) ?? [];
  return [...stops, ...contacts, ...hazardTrace, ...changes, ...surfaces, ...objects, ...traversal, ...events];
}
