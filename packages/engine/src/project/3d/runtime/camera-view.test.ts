import { expect, test } from 'bun:test';
import { lookAtViewMat4 } from '../../../render/3d-core.ts';
import { runtimeCameraView } from './camera-view.ts';
import { combatMotionFixture } from '../combat-motion-fixture.ts';
import { sample3DFrame } from '../../runtime-3d.ts';

type Camera = Parameters<typeof runtimeCameraView>[1];
const authored: Camera = { position: [0, 4, 8], target: [0, 1, 0], up: [0, 1, 0] };

test('valid presentation cameras retain their exact matrix without mutation', () => {
  const before = structuredClone(authored);
  expect(runtimeCameraView(new Float32Array(16), authored, authored)).toEqual(lookAtViewMat4(new Float32Array(16), authored.position, authored.target, authored.up));
  expect(authored).toEqual(before);
});

test('coincident shots reconstruct authored direction and parallel up gets an orthogonal basis', () => {
  const positions: Camera['position'][] = [[3, 2, -5], [0, 0, 0]];
  for (const position of positions) {
    const camera: Camera = { ...authored, position, target: [...position] }, before = structuredClone(camera);
    const first = runtimeCameraView(new Float32Array(16), camera, authored);
    expect([...first].every(Number.isFinite)).toBe(true);
    expect(runtimeCameraView(new Float32Array(16), camera, authored)).toEqual(first);expect(camera).toEqual(before);
  }
  const vertical: Camera = { ...authored, position: [0, 4, 0], target: [0, 0, 0] };
  expect([...runtimeCameraView(new Float32Array(16), vertical, authored)].every(Number.isFinite)).toBe(true);
  expect(() => lookAtViewMat4(new Float32Array(16), vertical.position, vertical.target, vertical.up)).toThrow();
});

test('public evaluated-frame projection survives a collapsed camera without altering save or frame', async () => {
  const { runtime, game } = await combatMotionFixture();
  const frame = sample3DFrame({ declaration: runtime.declaration, clock: { kind: 'video', frameIndex: 0, fps: 60 }, viewport: { width: 1280, height: 720 } });
  frame.camera.position = [3, 2, 1];frame.camera.target = [3, 2, 1];
  const before = structuredClone(frame), saved = game.snapshot();
  expect([...runtime.viewProjectionForFrame(frame, 1.7777777777777777)].every(Number.isFinite)).toBe(true);
  expect(frame).toEqual(before);expect(game.snapshot()).toEqual(saved);
});
