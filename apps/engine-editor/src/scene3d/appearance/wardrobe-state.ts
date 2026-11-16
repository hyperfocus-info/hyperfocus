import { resolveAppearance3D, type AppearanceCatalog3D } from '@hyperfocus/engine/project/runtime-3d';
import { profileObject, readProfileCommand } from '@hyperfocus/touch-of-death/appearance/profile';

export type PlayerAppearance = { name: string; icon: string; selections: Record<string, string> };
export type WardrobeSave = { version: 1; current: PlayerAppearance; presets: Array<{ name: string; look: PlayerAppearance }> };

export function readPlayerAppearance(value: unknown, catalog: AppearanceCatalog3D): PlayerAppearance {
  profileObject(value, ['name', 'icon', 'selections']);
  const command = readProfileCommand({ type: 'profile-save', requestId: 'local-look', expectedRevision: 0, ...value });
  resolveAppearance3D({ catalog, actorId: catalog.actors[0]!.entityId, selections: command.selections });
  return { name: command.name, icon: command.icon, selections: { ...command.selections } };
}

function presetName(value: unknown): string {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)) throw new Error('Give this outfit a name without control characters.');
  const name = value.trim().normalize('NFC');
  if (!name || [...name].length > 24) throw new Error('Give this outfit a name up to 24 characters.');
  return name;
}

export function createWardrobeState(options: {
  catalog: AppearanceCatalog3D; load(): Promise<unknown>; save(value: WardrobeSave): Promise<void>;
  canEquip?(slot: string, option: string): boolean;
  requireWorld?(): void;
}) {
  const defaults = (): WardrobeSave => ({ version: 1, current: { name: 'New challenger', icon: 'fist', selections: Object.fromEntries(options.catalog.slots.map(slot => [slot.id, slot.defaultOptionId])) }, presets: [] });
  let saved = defaults(), draft = structuredClone(saved.current), ready = false, busy = false, error = '', hasSavedDeviceFighter = false;
  function checkUnlocks(look: PlayerAppearance) {
    if (Object.entries(look.selections).some(([slot, option]) => options.canEquip?.(slot, option) === false && saved.current.selections[slot] !== option)) throw new Error('Unlock this style in Rewards before equipping it.');
  }
  function read(value: unknown): WardrobeSave {
    profileObject(value, ['version', 'current', 'presets']);
    if (value.version !== 1) throw new Error('This wardrobe save has an unsupported format.');
    const presets = value.presets;
    if (!Array.isArray(presets) || presets.length > 3) throw new Error('A wardrobe has at most three saved outfits.');
    if (Object.getPrototypeOf(presets) !== Array.prototype || Reflect.ownKeys(presets).length !== presets.length + 1) throw new Error('Invalid saved outfits.');
    return { version: 1, current: readPlayerAppearance(value.current, options.catalog), presets: Array.from({ length: presets.length }, (_, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(presets, index);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Invalid saved outfit data.');
      const item: unknown = descriptor.value;profileObject(item, ['name', 'look']);
      return { name: presetName(item.name), look: readPlayerAppearance(item.look, options.catalog) };
    }) };
  }
  return {
    get state() { return { ready, busy, error, hasSavedDeviceFighter, draft: structuredClone(draft), saved: structuredClone(saved), dirty: JSON.stringify(draft) !== JSON.stringify(saved.current) }; },
    initialProfile(): PlayerAppearance | undefined {
      if (busy) throw new Error('Wait for your fighter to finish loading or saving, then join again.');
      if (!ready) throw new Error('Open Your fighter and retry loading or choose defaults before joining.');
      return hasSavedDeviceFighter ? structuredClone(saved.current) : undefined;
    },
    async load() {
      options.requireWorld?.();
      if (busy) return;busy = true;error = '';
      try { const raw = await options.load();saved = raw == null ? defaults() : read(raw);hasSavedDeviceFighter = raw != null;draft = structuredClone(saved.current);ready = true; }
      catch (cause) { error = cause instanceof Error ? cause.message : 'Could not load your fighter.';ready = false;hasSavedDeviceFighter = false; }
      finally { busy = false; }
    },
    edit(look: PlayerAppearance) { options.requireWorld?.();if (!ready || busy) throw new Error('Wait for your wardrobe to finish loading or saving.');checkUnlocks(look);draft = readPlayerAppearance(look, options.catalog);error = ''; },
    discard() { if (!busy) { draft = structuredClone(saved.current);error = ''; } },
    useDefaults() { options.requireWorld?.();if (busy) return;saved = defaults();draft = structuredClone(saved.current);ready = true;error = '';hasSavedDeviceFighter = false; },
    usePreset(index: number) { options.requireWorld?.();if (!ready || busy || !saved.presets[index]) throw new Error('Choose a saved outfit.');checkUnlocks(saved.presets[index]!.look);draft = structuredClone(saved.presets[index]!.look);error = ''; },
    async save(preset?: { index: number; name: string }) {
      options.requireWorld?.();
      if (!ready || busy) return;busy = true;error = '';
      try {
        checkUnlocks(draft);const next = structuredClone(saved);next.current = readPlayerAppearance(draft, options.catalog);
        if (preset) {
          if (!Number.isInteger(preset.index) || preset.index < 0 || preset.index > Math.min(2, next.presets.length)) throw new Error('Choose one of three outfit slots.');
          const name = presetName(preset.name);
          next.presets[preset.index] = { name, look: structuredClone(next.current) };
        }
        await options.save(next);saved = next;hasSavedDeviceFighter = true;
      } catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save your fighter. Your changes are still here.'; }
      finally { busy = false; }
    },
  };
}
