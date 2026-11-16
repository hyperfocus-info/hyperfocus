import { readList, readObject, readTuple, optional, requireBoolean, requireNumber, requireOneOf, type ObjectReaders } from '@hyperfocus/utilities/validation';
import { requireText } from '@hyperfocus/utilities/text';
import { appearanceStyleChoices, type AppearanceColor3D, type AppearanceStyle3D, type ResolvedAppearance3D, type ResolvedAppearancePose3D } from './catalog.ts';
import type { CombatFramePresentation3D } from '../combat-presentation.ts';

let poseFields: ObjectReaders<ResolvedAppearancePose3D>;
const colorPart = (value: unknown) => requireNumber(value, { minimum: 0, maximum: 1 });

function readColor(value: unknown): AppearanceColor3D {
  return readTuple(value, [colorPart, colorPart, colorPart, value => requireOneOf(value, [1] as const)]);
}

function isStyleChannel(value: unknown): value is AppearanceStyle3D['channel'] {
  return typeof value === 'string' && Object.hasOwn(appearanceStyleChoices, value);
}

function readStyleChannel(value: unknown) {
  if (!isStyleChannel(value)) throw new TypeError('Unknown appearance style channel.');
  return value;
}

let styleFields: ObjectReaders<AppearanceStyle3D & { actorId: string }>;

function readStyles(value: unknown) {
  return readList(value, value => {
    const style = readObject(value, (styleFields ??= {
  actorId: requireText, channel: readStyleChannel, style: requireText,
}));
    requireOneOf(style.style, appearanceStyleChoices[style.channel], 'appearance style');
    return style;
  });
}

/** Detached resolved presentation data; this checks shape, not authored references. */
export function readResolvedAppearancePoses3D(value: unknown): ResolvedAppearancePose3D[] {
  return structuredClone(readList(value, item => readObject(item, (poseFields ??= {
  actorId: requireText,
  phase: value => requireOneOf(value, ['intro', 'victory'] as const),
  style: value => requireOneOf(value, ['default', 'bow', 'salute', 'fists-up'] as const),
}))));
}

let appearanceFields: ObjectReaders<ResolvedAppearance3D>;

/** No defaults or field filtering; callers retain existing scene/reference checks. */
export function readResolvedAppearance3D(value: unknown): ResolvedAppearance3D {
  return structuredClone(readObject(value, (appearanceFields ??= {
  variants: value => readList(value, item => readObject(item, { entityId: requireText, variantId: requireText })),
  colors: value => readList(value, item => readObject(item, { materialId: requireText, baseColor: readColor })),
  poses: optional(readResolvedAppearancePoses3D),
  styles: optional(readStyles),
})));
}

export type CombatFramePresentationData3D = Pick<CombatFramePresentation3D, 'poses' | 'styles' | 'reducedMotion'>;
let presentationFields: ObjectReaders<CombatFramePresentationData3D>;

/** The serializable worker projection, without live callbacks or prepared resources. */
export function readCombatFramePresentation3D(value: unknown): CombatFramePresentationData3D {
  return structuredClone(readObject(value, (presentationFields ??= {
  poses: optional(readResolvedAppearancePoses3D), styles: optional(readStyles), reducedMotion: optional(requireBoolean),
})));
}
