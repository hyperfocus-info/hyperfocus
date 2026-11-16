import { expect, test } from 'bun:test';
import { createBoundedScene3D, createRenderCommandBuffer3D } from '../render/3d-scene.ts';
import { createRenderFramePacket3D } from './frame-packet-3d.ts';

function fixture() {
  const scene = createBoundedScene3D({ transforms: 4, instances: 4, materials: 2, meshes: 1, lights: 1 });
  const mesh = scene.registerMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });
  const material = scene.createMaterial({ baseColor: [.2, .4, .6, .8], alphaMode: 'blend' });
  const transform = scene.transforms.create();scene.transforms.setPosition(transform, 5, 6, 7);
  const instance = scene.createInstance({ mesh, material, transform });scene.setInstanceAppearance(instance, { color: [.5, .6, .7, 1] });
  scene.createLight({ kind: 'ambient', intensity: .3 });
  const commands = scene.compile(createRenderCommandBuffer3D({ commands: 4, instances: 4, lights: 1 }));
  return { scene, commands, instance };
}

test('transferred render packets preserve every command array and material byte without aliasing live scene state', () => {
  const source = fixture(), target = fixture(), packet = createRenderFramePacket3D(source);
  const original = new ArrayBuffer(packet.byteLength);packet.write({ ...source, buffer: original });
  const transferred = structuredClone(original, { transfer: [original] });expect(original.byteLength).toBe(0);
  const restored = packet.read({ buffer: transferred, scene: target.scene });
  expect(restored).toEqual(source.commands);expect(target.scene.materialData).toEqual(source.scene.materialData);
  source.scene.materialData.fill(0);source.commands.instanceMatrices.fill(0);
  expect(target.scene.materialData[0]).toBeCloseTo(.2);expect(restored.instanceMatrices[12]).toBe(5);
  expect(restored.instanceMatrices.buffer).toBe(transferred);
});

test('reuse clears active counts and appearance state, rejects capacity/header mismatches', () => {
  const source = fixture(), packet = createRenderFramePacket3D(source), buffer = new ArrayBuffer(packet.byteLength);
  packet.write({ ...source, buffer });source.scene.setInstanceVisible(source.instance, false);source.scene.compile(source.commands);
  source.commands.instanceAppearance = undefined;packet.write({ ...source, buffer });
  const restored = packet.read({ buffer, scene: source.scene });expect(restored.instanceCount).toBe(0);expect(restored.instanceAppearance).toBeUndefined();
  expect(() => packet.read({ buffer: new ArrayBuffer(16), scene: source.scene })).toThrow('capacity');
  new Uint32Array(buffer)[2] = 1000;expect(() => packet.read({ buffer, scene: source.scene })).toThrow('header');
});

test('layout mismatches fail before partially overwriting the packet or receiving scene', () => {
  const source = fixture(), packet = createRenderFramePacket3D(source), buffer = new ArrayBuffer(packet.byteLength);
  new Uint8Array(buffer).fill(37);source.commands.instanceAppearance = new Float32Array(8);
  expect(() => packet.write({ ...source, buffer })).toThrow('appearance capacity');
  expect(new Uint8Array(buffer).every(value => value === 37)).toBe(true);
  source.commands.instanceAppearance = undefined;packet.write({ ...source, buffer });
  const scene = createBoundedScene3D({ transforms: 4, instances: 4, materials: 3, meshes: 1, lights: 1 });
  scene.materialData.fill(42);
  expect(() => packet.read({ buffer, scene })).toThrow('destination layout');
  expect(scene.materialData.every(value => value === 42)).toBe(true);
});
