import type { CombatSnapshot } from '@hyperfocus/engine/combat';
import type { Hyperfocus3DDeclaration, Hyperfocus3DEvaluatedFrame } from '@hyperfocus/engine/project/runtime-3d';

type Frame = Hyperfocus3DEvaluatedFrame;
type Fighter = CombatSnapshot['fighters'][number];

/** Presentation-only offsets and isolated material looks; simulation and authored materials stay authoritative. */
export function presentFighterFeedback({ frame, fighter, rigId, hitstop, hit, heavy, fire, reducedMotion = false, heldId, authored }: {
  frame: Frame; fighter: Fighter; rigId: string; hitstop: number; hit: boolean; heavy: boolean; fire: boolean; reducedMotion?: boolean; heldId?: string;
  authored: ReadonlyMap<string, Pick<Hyperfocus3DDeclaration['scenes'][number]['entities'][number], 'materialId' | 'variants'>>;
}) {
  const stunned = fighter.stunKind === 'hit' && fighter.stunFrames > 0;
  const armor = fighter.armorFrames > 0, tech = fighter.protectionFrames > 0;
  // Armor and tech use body rims and local particles; reserve the shield for actual guard.
  const shield = frame.entities.find(part => part.id === `${fighter.id}:guard-shell`);
  if (shield && (armor || tech)) shield.visible = false;
  const blocked = fighter.stunKind === 'block' && fighter.stunFrames > 0;
  const active = fighter.health > 0 && (stunned || armor || fire || tech || blocked);
  const tint: [number, number, number] = fire ? [1, .28, .045] : armor ? [1, .73, .22] : tech ? [.65, .92, 1] : blocked ? [.25, .75, 1] : heavy ? [1, .49, .32] : [1, .9, .72];
  const strength = fire ? .14 : armor ? .11 : tech ? .1 : blocked ? .06 : heavy ? .13 : .07;
  const pulse = reducedMotion ? 1 : .88 + .12 * Math.sin(frame.timeSeconds * 12);
  // The remaining pause ticks advance while the combat pose stays frozen. No wall-clock history or random jitter.
  const shake = !reducedMotion && hit && hitstop > 0 ? Math.min(1, hitstop / 3) * (heavy ? .027 : .018) : 0;
  const side = Math.sin(hitstop * 2.4) * shake, up = Math.cos(hitstop * 2.9) * shake * .3;
  const prefix = `${fighter.id}:state:`, materials = new Map(frame.materials.map(material => [material.id, material]));
  for (const part of frame.entities) {
    const body = part.id.startsWith(`${rigId}:`) || part.id.startsWith(`${fighter.id}:wardrobe:`);
    if (!part.visible || !body && part.id !== heldId) continue;
    if (shake) part.position = [part.position[0] + fighter.facing.z * side, part.position[1] + up, part.position[2] - fighter.facing.x * side];
    const original = authored.get(part.id);
    const currentId = part.renderMaterialId ?? original?.variants?.find(variant => variant.id === part.variantId)?.materialId ?? original?.materialId;
    if (!body || !currentId) continue;
    const sourceId = currentId.startsWith(prefix) ? currentId.slice(prefix.length) : currentId;
    part.renderMaterialId = sourceId;
    const source = materials.get(sourceId);
    if (!active || !source) continue;
    const id = prefix + sourceId;
    const destination = materials.get(id);
    if (!destination) continue;
    const look = source.look, amount = strength * pulse;
    destination.look = { ...look,
        baseColor: [look.baseColor[0] * (1 - amount) + tint[0] * amount, look.baseColor[1] * (1 - amount) + tint[1] * amount, look.baseColor[2] * (1 - amount) + tint[2] * amount, look.baseColor[3]],
        emissive: [look.emissive[0] + tint[0] * amount * .35, look.emissive[1] + tint[1] * amount * .35, look.emissive[2] + tint[2] * amount * .35],
        ...(look.toon ? { toon: { ...look.toon, rimColor: tint, rimStrength: Math.max(look.toon.rimStrength, armor || fire ? .55 : .38) } } : {}),
    };
    part.renderMaterialId = id;
  }
}
