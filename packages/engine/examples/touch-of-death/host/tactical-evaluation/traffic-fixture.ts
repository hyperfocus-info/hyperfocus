import { arena } from './fixture.ts';
import type { Hyperfocus3DDeclaration } from '@hyperfocus/engine/project/runtime-3d';

/** Headless traffic remains active even when initially outside the camera/floor. */
export function trafficFixture(createPreset: Parameters<typeof arena>[0], scenario: 'crossing' | 'rotated-crossing' | 'wreck') {
  const content = arena(createPreset), scene = content.project.extensions.hyperfocus3D.scenes[0]!;
  scene.entities[1]!.position = [20, 1, 0];
  const cars = scenario !== 'wreck' ? ['car'] : ['car', 'following'];
  for (const [index, id] of cars.entries()) {
    const x = scenario !== 'wreck' ? -120 : index ? -2 : 1.25;
    const animation: NonNullable<Hyperfocus3DDeclaration['scenes'][number]['entities'][number]['animation']> = scenario !== 'wreck' ? { kind: 'ping-pong', offset: [240, 0, 0], periodSeconds: 12, travelSeconds: 6, phase: 0 }
      : { kind: 'ping-pong', offset: [8, 0, 0], periodSeconds: 20, travelSeconds: 1, phase: .4 };
    const car: Hyperfocus3DDeclaration['scenes'][number]['entities'][number] = { id, meshId: 'mesh', materialId: 'material', position: [x, 1, 0], scale: [.5, 1, 1], rotationY: scenario === 'rotated-crossing' ? Math.PI / 4 : 0,
      animation, physics: { type: 'static', shape: 'box', gravityScale: 0, continuous: false } };
    scene.entities.push(car, { ...car, id: `${id}:glass`, position: [x, 1.2, .51], scale: [.2, .2, .02], physics: undefined });
  }
  content.project.extensions.hyperfocus3D.budgets.entities = 16;
  Object.assign(content.project.extensions.hyperfocusCombat, { environment: {
    surfaces: cars.map(entityId => ({ entityId, trigger: { kind: 'impact', minSpeed: 1 }, stopMotionIds: [`${entityId}:glass`], hideIds: [`${entityId}:glass`] })),
    traffic: cars.map(entityId => ({ entityId, moveId: 'heavy', minSpeed: 3 })),
  } });
  return content;
}
