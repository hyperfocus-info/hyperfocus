export type CityGenerationSettings = {
  seed: number;
  density: number;
  districtSize: 'compact' | 'standard';
  hazardFrequency: number;
  maxEntities: number;
  maxPhysicsBodies: number;
  maxMovingBodies: number;
};

export const cityGenerationDefaults: CityGenerationSettings = {
  seed: 0, density: 1, districtSize: 'standard', hazardFrequency: 1,
  maxEntities: 6000, maxPhysicsBodies: 768, maxMovingBodies: 64,
};

/** Generation limits are inputs, not budgets silently raised to fit the output. */
export function readCityGenerationSettings(input?: unknown): CityGenerationSettings {
  if (input === undefined) return { ...cityGenerationDefaults };
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('City settings must be an options object.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(cityGenerationDefaults, key)) throw new Error(`Unknown city setting: ${key}.`);
  const numeric = (key: Exclude<keyof CityGenerationSettings, 'districtSize'>, min: number, max: number, integer = false) => {
    const value: unknown = Object.hasOwn(input, key) ? Reflect.get(input, key) : cityGenerationDefaults[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) throw new Error(`${key} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
    return value;
  };
  const districtSize: unknown = Object.hasOwn(input, 'districtSize') ? Reflect.get(input, 'districtSize') : 'standard';
  if (districtSize !== 'standard' && districtSize !== 'compact') throw new Error('Choose compact or standard district size.');
  return { seed: numeric('seed', 0, 4294967295, true), density: numeric('density', .25, 1), districtSize,
    hazardFrequency: numeric('hazardFrequency', .25, 2), maxEntities: numeric('maxEntities', 512, 12000, true),
    maxPhysicsBodies: numeric('maxPhysicsBodies', 64, 1024, true), maxMovingBodies: numeric('maxMovingBodies', 1, 128, true) };
}
