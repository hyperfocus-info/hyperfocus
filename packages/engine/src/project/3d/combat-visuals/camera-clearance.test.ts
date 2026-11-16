import { expect, test } from 'bun:test';
import { createRigidWorld3D } from '../../../physics/rigid-3d.ts';
import type { Hyperfocus3DEvaluatedFrame } from '../../../frame/3d.ts';
import { clearCombatCameraSurfaces } from './camera-clearance.ts';
import { lookAtViewMat4 } from '../../../render/3d-core.ts';

function fixture() {
  const world = createRigidWorld3D({ capacity: 4, gravityY: 0 });
  world.addBody({ id: 'roof', type: 'static', shape: { kind: 'box', halfX: 5, halfY: .2, halfZ: 5 }, y: 6 });
  const frame: Pick<Hyperfocus3DEvaluatedFrame, 'camera'> = { camera: { position: [0, 5.95, 0], target: [0, 1, -5], up: [0, 1, 0], near: .1, far: 100, fovYRadians: 1 } };
  return { world, frame, bodyIds: ['roof'] };
}

test('an obstruction immediately beside the target cannot collapse eye onto target', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 4, halfY: 3, halfZ: .2 }, y: 1, z: .502 });
  const frame: Pick<Hyperfocus3DEvaluatedFrame, 'camera'> = { camera: { position: [0, 1, 10], target: [0, 1, 0], up: [0, 1, 0], near: .1, far: 100, fovYRadians: 1 } };
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['wall'] });
  expect(() => lookAtViewMat4(new Float32Array(16), frame.camera.position, frame.camera.target, frame.camera.up)).not.toThrow();
  expect(frame.camera.position[2]).toBeLessThan(.0021);
  expect(Math.hypot(...frame.camera.position.map((value, index) => value - frame.camera.target[index]!))).toBeGreaterThan(0);
});

test('recovery camera stays below a raised roof when the fighters are beneath it', () => {
  const options = fixture();
  clearCombatCameraSurfaces(options);
  expect(options.frame.camera.position[1]).toBeLessThan(5.5);
  expect(options.frame.camera.position[1]).toBeGreaterThan(5.4);
  const once = structuredClone(options.frame);
  clearCombatCameraSurfaces(options);expect(options.frame).toEqual(once);
  expect(options.frame.camera.target).toEqual([0, 1, -5]);
});

test('camera clearance follows moving supports and ignores removed surfaces', () => {
  const options = fixture();
  options.world.configureBody('roof', { collisionMask: 0 });
  clearCombatCameraSurfaces(options);expect(options.frame.camera.position[1]).toBe(5.95);
  options.world.configureBody('roof', { collisionMask: 1 });options.world.setPosition('roof', 0, 9, 0);
  clearCombatCameraSurfaces(options);expect(options.frame.camera.position[1]).toBe(5.95);
  options.frame.camera.position[1] = 9;
  clearCombatCameraSurfaces(options);expect(options.frame.camera.position[1]).toBeLessThan(8.5);
  expect(options.frame.camera.position[1]).toBeGreaterThan(8.4);
});

test('camera cannot cross entirely through a raised slab when its endpoint is below the slab', () => {
  const options = fixture();options.frame.camera.target = [0, 8, 0];options.frame.camera.position = [0, 4, 0];
  clearCombatCameraSurfaces(options);
  expect(options.frame.camera.position[1]).toBeGreaterThanOrEqual(6.5);
});

test('authored fading walls preserve the fitted two-fighter distance through a breach', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'wall', type: 'static', shape: { kind: 'box', halfX: 4, halfY: 3, halfZ: .2 }, y: 3, z: 1 });
  const camera: Hyperfocus3DEvaluatedFrame['camera'] = { position: [0, 4, 9], target: [0, 1.5, 0], up: [0, 1, 0], near: .1, far: 100, fovYRadians: 1 };
  const frame = { camera, materials: [{ id: 'wall:occlusion' }], entities: [{ id: 'wall' }] }, original = structuredClone(camera);
  const materialIds = new Map([['wall', 'wall:occlusion']]);
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['wall'], materialIds });expect(frame.camera).toEqual(original);
  world.configureBody('wall', { collisionMask: 0 });clearCombatCameraSurfaces({ frame, world, bodyIds: ['wall'], materialIds });expect(frame.camera).toEqual(original);
  world.configureBody('wall', { collisionMask: 1 });materialIds.set('wall', 'opaque-override');
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['wall'], materialIds });expect(frame.camera.position[2]).toBeLessThan(1);
});

test('an occlusion-enabled floor still prevents the camera from entering or crossing the ground', () => {
  const options = fixture(), frame = { ...options.frame, materials: [{ id: 'roof:occlusion' }], entities: [{ id: 'roof' }] };
  frame.camera.target = [0, 8, 0];frame.camera.position = [0, 4, 0];
  const materialIds = new Map([['roof', 'roof:occlusion']]);
  clearCombatCameraSurfaces({ ...options, frame, materialIds });expect(frame.camera.position[1]).toBeGreaterThanOrEqual(6.5);
  frame.camera.target = [0, 6.3, 0];frame.camera.position = [0, 6, 0];
  clearCombatCameraSurfaces({ ...options, frame, materialIds });expect(frame.camera.position[1]).toBeGreaterThanOrEqual(6.5);
});

test('passing low vehicles never change camera distance, including when the camera is inside their faded hull', () => {
  const world = createRigidWorld3D({ capacity: 1, gravityY: 0 });
  world.addBody({ id: 'car', type: 'static', shape: { kind: 'box', halfX: 2.2, halfY: .55, halfZ: .95 }, y: .8, z: 4 });
  const camera: Hyperfocus3DEvaluatedFrame['camera'] = { position: [0, 1.5, 9], target: [0, 1.5, 0], up: [0, 1, 0], near: .1, far: 100, fovYRadians: 1 };
  const frame = { camera: structuredClone(camera), materials: [{ id: 'car:occlusion' }], entities: [{ id: 'car' }] };
  const materialIds = new Map([['car', 'car:occlusion']]), movingBodyIds = new Set(['car']);
  for (const z of [4, 9]) for (let tick = 0; tick <= 60; tick++) {
    world.setPosition('car', -5 + tick / 6, .8, z);frame.camera = structuredClone(camera);
    clearCombatCameraSurfaces({ frame, world, bodyIds: ['car'], materialIds, movingBodyIds });
    expect(frame.camera).toEqual(camera);
  }
  materialIds.set('car', 'opaque');world.setPosition('car', 0, .8, 4);
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['car'], materialIds, movingBodyIds });
  expect(frame.camera.position[2]).toBeLessThan(4);
});

test('authored overhead slabs fade without zooming while opaque slabs retain collision safety', () => {
  const options = fixture(), frame = { ...options.frame, materials: [{ id: 'roof:occlusion' }], entities: [{ id: 'roof' }] };
  const camera = structuredClone(frame.camera), materialIds = new Map([['roof', 'roof:occlusion']]);
  clearCombatCameraSurfaces({ ...options, frame, materialIds });expect(frame.camera).toEqual(camera);
  materialIds.set('roof', 'opaque');clearCombatCameraSurfaces({ ...options, frame, materialIds });expect(frame.camera.position[1]).toBeLessThan(5.5);
});

test('a low bench beside the fighters and its fading trim cannot collapse the fitted camera', () => {
  const world = createRigidWorld3D({ capacity: 2, gravityY: 0 });
  world.addBody({ id: 'bench', type: 'static', shape: { kind: 'box', halfX: 1.3, halfY: .45, halfZ: .55 }, x: -52.5, y: 6.45, z: -21.2 });
  world.addBody({ id: 'trim', type: 'static', shape: { kind: 'box', halfX: 1.32, halfY: .015, halfZ: .57 }, x: -52.5, y: 6.915, z: -21.2 });
  const camera: Hyperfocus3DEvaluatedFrame['camera'] = { position: [-52.697, 12.12, -10.504], target: [-52.697, 6.901, -22.191], up: [0, 1, 0], near: .1, far: 300, fovYRadians: .85 };
  const frame = { camera: structuredClone(camera), materials: [{ id: 'bench:occlusion' }, { id: 'bench:occlusion-follow:concrete' }], entities: [{ id: 'bench' }, { id: 'trim' }] };
  const materialIds = new Map([['bench', 'bench:occlusion'], ['trim', 'bench:occlusion-follow:concrete']]);
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['bench', 'trim'], materialIds });
  expect(frame.camera).toEqual(camera);
  // An actual opaque replacement must retain collision safety.
  materialIds.set('trim', 'opaque');
  clearCombatCameraSurfaces({ frame, world, bodyIds: ['bench', 'trim'], materialIds });
  expect(frame.camera.position).not.toEqual(camera.position);
});
