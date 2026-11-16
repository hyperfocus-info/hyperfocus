export type PracticeRandomDefense = { seed: number; choice: number; tech: boolean; serial: number; touching: boolean };
export function initialRandomDefense(seed = 0x746f64): PracticeRandomDefense { return { seed, choice: 0, tech: false, serial: -1, touching: false }; }
export function sampleRandomDefense(state: PracticeRandomDefense) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  state.choice = state.seed % 5;
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  state.tech = state.seed / 4294967296 < .6;
}
export function validateRandomDefense(value: unknown): PracticeRandomDefense {
  if (value === undefined) return initialRandomDefense();
  if (!isRecord(value)) throw new Error('Invalid random defense.');
  const state = value;
  if (Object.keys(state).length !== 5 || !Number.isInteger(state.seed) || Number(state.seed) < 0 || Number(state.seed) > 4294967295 || !Number.isInteger(state.choice) || Number(state.choice) < 0 || Number(state.choice) > 4 || !Number.isInteger(state.serial) || Number(state.serial) < -1 || typeof state.tech !== 'boolean' || typeof state.touching !== 'boolean') throw new Error('Invalid random defense.');
  return { seed: Number(state.seed), choice: Number(state.choice), serial: Number(state.serial), tech: state.tech, touching: state.touching };
}
import { isRecord } from '@hyperfocus/utilities/records';
