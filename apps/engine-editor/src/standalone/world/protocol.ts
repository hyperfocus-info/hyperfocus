import { optional, readList, readObject, readTuple, requireBoolean, requireNumber, requireOneOf } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';
import { readGameplayProject3D, readGameplaySnapshot3D, readHyperfocus3DTimeline, readPortableAssets3D, readResolvedAppearance3D, readCombatFramePresentation3D, readCombatAiPolicy, readCombatAiLearning, readCombatAiTuning } from '@hyperfocus/engine/project/runtime-3d';
import type { PortableAsset3D } from '@hyperfocus/engine/project/runtime-3d';

const inputFields = {
  actions: (value: unknown) => readList(value, requireText),
  width: (value: unknown) => requireNumber(value, { minimum: Number.MIN_VALUE }), height: (value: unknown) => requireNumber(value, { minimum: Number.MIN_VALUE }),
  paused: requireBoolean, reducedMotion: optional(requireBoolean),
  localDirection: optional((value: unknown) => readObject(value, { x: requireNumber, y: requireNumber, z: requireNumber })),
};
const policy = optional(readCombatAiPolicy), learning = optional(readCombatAiLearning), tuning = optional(readCombatAiTuning);
const initFields = {
  project: readGameplayProject3D, assets: (value: unknown): readonly PortableAsset3D[] => readPortableAssets3D(value), checkpoint: readGameplaySnapshot3D, timeline: optional(readHyperfocus3DTimeline),
  looks: (value: unknown) => readList(value, readResolvedAppearance3D), presentation: readCombatFramePresentation3D,
  gameplayOptions: (value: unknown) => readObject(value, { combatAiPolicies: optional((value: unknown) => readTuple(value, [policy, policy])), combatAiLearning: optional((value: unknown) => readTuple(value, [learning, learning])), combatAiTuning: optional((value: unknown) => readTuple(value, [tuning, tuning])) }),
  input: (value: unknown) => readObject(value, inputFields), services: optional((value: unknown) => requireOneOf(value, ['none', 'review', 'full'])), diagnostic: optional(requireBoolean),
  provenance: optional((value: unknown) => readObject(value, { owner: (value: unknown) => requireText(value, { min: 1 }), trace: requireBoolean })), learning: optional(requireBoolean),
};

export type WorldInit = ReturnType<typeof readWorldInit>;
export type WorldInput = WorldInit['input'];

/** One worker owns one parsed init and world until termination. Canonical readers
 * detach mutable payloads; asset bytes follow the engine reader's borrowed contract. */
export function readWorldInit(value: unknown) { return readObject(value, initFields); }
