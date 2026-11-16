import { combatMotionFixture } from '../../combat-motion-fixture.ts';
import { createGameplay3D, createHyperfocus3DRuntime } from '../../../runtime-3d.ts';
import type { Hyperfocus3DDeclaration, SceneAnimation3D } from '../../declaration.ts';

export async function vehicleFixture({ followers = 1, followingTravelSeconds = 1, audio = false }: { followers?: number; followingTravelSeconds?: number; audio?: boolean } = {}) {
  const base = await combatMotionFixture({ match: true }), project = structuredClone(base.project);
  const scene = project.extensions.hyperfocus3D.scenes[0]!;scene.entities[1]!.position = [20, 1, 0];
  const ids = ['car', ...Array.from({ length: followers }, (_, index) => index ? 'following-' + index : 'following')];
  const entities: Hyperfocus3DDeclaration['scenes'][number]['entities'] = ids.flatMap((id, index) => {
    const travelSeconds = index ? followingTravelSeconds : 1, periodSeconds = 18 + travelSeconds * 2;
    const position: [number, number, number] = [1.25 - index * 3.25, 1, 0], animation: SceneAnimation3D = { kind: 'ping-pong', offset: [8, 0, 0], periodSeconds, travelSeconds, phase: 8 / periodSeconds };
    return [{ id, meshId: 'mesh', materialId: 'material', position, scale: [.5, 1, 1], rotationY: 0, animation, physics: { type: 'static' as const, shape: 'box' as const, gravityScale: 0, continuous: false } },
      { id: id + ':glass', meshId: 'mesh', materialId: 'material', position: [position[0], 1.2, .51], scale: [.2, .2, .02], rotationY: 0, animation },
      { id: id + ':damage', meshId: 'mesh', materialId: 'material', position: [position[0], 1, .51], scale: [.2, .1, .02], rotationY: 0, animation }];
  });
  scene.entities.push(...entities);project.extensions.hyperfocus3D.budgets.entities = 20;
  Object.assign(project.extensions.hyperfocusCombat, { environment: { surfaces: ids.map(entityId => ({ entityId, trigger: { kind: 'impact', minSpeed: 1 }, stopMotionIds: [entityId + ':glass', entityId + ':damage'], hideIds: [entityId + ':glass'], revealIds: [entityId + ':damage'] })), traffic: ids.map(entityId => ({ entityId, moveId: 'heavy', minSpeed: 3 })) } });
  if (audio) {
    Object.assign(project.extensions.hyperfocusCombat, { audio: { cues: { environmentBreak: 'crash' } } });
    Object.assign(project, { assets: [{ id: 'crash', mimeType: 'audio/wav' }] });
  }
  const runtime = await createHyperfocus3DRuntime(project, base.assets), game = createGameplay3D({ project, runtime });
  return { project, runtime, game, assets: base.assets };
}
