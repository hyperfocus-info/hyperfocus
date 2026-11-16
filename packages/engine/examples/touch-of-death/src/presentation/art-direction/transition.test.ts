import { expect, test } from 'bun:test';
import { sampleArtMotion } from './motion.ts';
import { createArtMotionTransition } from './transition.ts';

test('state changes preserve continuity and repeated renders cannot advance motion during hitstop', () => {
  const transition = createArtMotionTransition(), idle = sampleArtMotion({ kind: 'idle', frame: 0 });
  transition.sample({ pose: idle, key: 'idle', tick: 0, frames: 8 });
  const strike = sampleArtMotion({ kind: 'heavy', frame: 20 });
  const entered = transition.sample({ pose: strike, key: 'heavy', tick: 1, frames: 4 });
  expect(entered.right).toEqual(idle.right);
  const middle = transition.sample({ pose: strike, key: 'heavy', tick: 3, frames: 4 });
  expect(middle.right).not.toEqual(idle.right);
  const changedTarget = sampleArtMotion({ kind: 'heavy', frame: 28 });
  expect(transition.sample({ pose: changedTarget, key: 'heavy', tick: 3, frames: 4 })).toBe(middle);
  expect(transition.sample({ pose: strike, key: 'heavy', tick: 5, frames: 4 })).toBe(strike);
  const interrupted = transition.sample({ pose: idle, key: 'idle', tick: 6, frames: 8 });
  expect(interrupted.right).toEqual(strike.right);
  expect(transition.sample({ pose: idle, key: 'idle', tick: 14, frames: 8 })).toBe(idle);
});

test('heavy rear foot rolls around one planted toe instead of lifting a flat boot', () => {
  const toe = (frame: number) => {
    const pose = sampleArtMotion({ kind: 'heavy', frame }), angle = pose.feet!.rightPitch;
    return [pose.rightFoot[1] - .088 * Math.cos(angle) - .188 * Math.sin(angle), pose.rightFoot[2] - .088 * Math.sin(angle) + .188 * Math.cos(angle)];
  };
  for (const frame of [0, 20, 28, 36, 60, 78]) {
    expect(toe(frame)[0]).toBeCloseTo(.012, 6);
    expect(toe(frame)[1]).toBeCloseTo(-.062, 6);
  }
});
