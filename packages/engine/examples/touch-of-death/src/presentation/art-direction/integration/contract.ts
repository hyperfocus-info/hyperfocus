import { z } from 'zod';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

const point = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const rest = z.object({ id: z.string().min(1), position: point, scale: point, rotationY: z.number().finite() });
export const directedFighterSchema = z.object({
  version: z.literal(1), bankAssetId: z.string().min(1),
  materialIds: z.array(z.string().min(1)).optional(),
  fighters: z.array(z.object({ entityId: z.string().min(1), rigId: z.string().min(1), rootHeight: z.number().positive(), rest: z.array(rest).min(20) })).length(2),
});
export type DirectedFighters = z.infer<typeof directedFighterSchema>;
export type DirectedFighter = DirectedFighters['fighters'][number];
export type RestPart = z.infer<typeof rest>;
export function readDirectedFighters(project: { extensions?: Record<string, unknown> }, declaration: Hyperfocus3DDeclaration) {
  const value = project.extensions?.hyperfocusTouchOfDeathArt;
  if (value === undefined) return undefined;
  const result = directedFighterSchema.parse(value);
  if (result.materialIds?.some(id => !declaration.materials.some(material => material.id === id))) throw new Error('Missing directed fighter presentation material.');
  const entities = declaration.scenes.find(scene => scene.id === declaration.activeSceneId)!.entities;
  if (new Set(result.fighters.map(f => f.entityId)).size !== 2 || new Set(result.fighters.map(f => f.rigId)).size !== 2) throw new Error('Directed fighters require distinct roots and rigs.');
  for (const fighter of result.fighters) {
    if (!entities.some(entity => entity.id === fighter.entityId)) throw new Error(`Missing directed fighter root: ${fighter.entityId}`);
    for (const part of fighter.rest) if (!part.id.startsWith(`${fighter.rigId}:`) || !entities.some(entity => entity.id === part.id)) throw new Error(`Missing directed fighter part: ${part.id}`);
  }
  return result;
}

/** Existing wardrobe/profile IDs stay stable; only evaluated presentation is bridged. */
export const legacyParts: Readonly<Record<string, string>> = {
  torso: '', head: ':head', hair: ':hair', 'left-hand': ':left-hand', 'right-hand': ':right-hand',
  'left-sleeve': ':left-arm', 'right-sleeve': ':right-arm', 'left-forearm': ':left-forearm', 'right-forearm': ':right-forearm',
  'left-thigh': ':left-thigh', 'right-thigh': ':right-thigh', 'left-shin': ':left-shin', 'right-shin': ':right-shin',
  'left-shoe': ':left-boot', 'right-shoe': ':right-boot',
};
