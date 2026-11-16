import { requireText } from "@hyperfocus/utilities/text";
import type { Hyperfocus3DSnapshot } from '../runtime-3d.ts';
import type { RuntimeCommand3D } from './runtime-commands.ts';

export type GameplayValue3D = null | boolean | number | string | GameplayValue3D[] | { [key: string]: GameplayValue3D };
export type GameplayPresentation3D = {
  reticle?: boolean;
  layout?: 'menu' | 'intro' | 'countdown' | 'fight' | 'result';
  title: string; objective?: string; hint?: string; status?: string;
  metrics?: Array<{ label: string; value: string; current?: number; max?: number }>;
  actions?: Array<{ action: string; label: string; disabled?: boolean; held?: boolean; range?: { min: number; max: number; value: number } }>;
  overlay?: { title: string; body: string };
  interactionTargets?: Record<string, string>;
};
export type GameplayAudio3D = { assetId: string; gain?: number; pan?: number; loop?: boolean; bus?: 'music' | 'sfx' | 'voice' | 'ambient'; category?: 'voice'; playbackRate?: number; impactStrength?: number; playlist?: string; musicIntensity?: number; priority?: number; duckMusic?: number; duckSeconds?: number; fadeSeconds?: number };
export type GameplayContext3D = {
  tick: number; deltaSeconds: number; firstStep: boolean; actions: readonly string[]; pressed: readonly string[];
  state: Record<string, GameplayValue3D>; component: { id: string; values: Record<string, string | number | boolean> };
  snapshot: Hyperfocus3DSnapshot;
  bodies: Array<{ id: string; type: string; position: [number, number, number]; velocity: [number, number, number] }>;
};
export type GameplayResult3D = {
  state?: Record<string, GameplayValue3D>; commands?: RuntimeCommand3D[];
  presentation?: GameplayPresentation3D; audio?: GameplayAudio3D[];
};
export type GameplayBehavior3D = (context: GameplayContext3D) => GameplayResult3D | void;

export function readGameplayState3D(value: unknown): Record<string, GameplayValue3D> {
  const state = object(value), seen = new Set<object>();let count = 0;
  function visit(item: unknown, depth: number): GameplayValue3D {
    if (++count > 16_384 || depth > 16) throw new Error('3D gameplay state exceeds its portable budget.');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'string' && item.length <= 32_768) return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object' || seen.has(item)) throw new Error('3D gameplay state must contain finite, acyclic portable JSON.');
    seen.add(item);
    const result: GameplayValue3D = Array.isArray(item) ? item.map(child => visit(child, depth + 1))
      : Object.fromEntries(Object.entries(object(item)).map(([key, child]) => {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe 3D gameplay state key.');
        return [key, visit(child, depth + 1)];
      }));
    seen.delete(item);return result;
  }
  return Object.fromEntries(Object.entries(state).map(([key, value]) => {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe 3D gameplay state key.');
    return [key, visit(value, 0)];
  }));
}
export function readGameplayPresentation3D(value: unknown): GameplayPresentation3D {
  const p = object(value), optional = (key: string) => p[key] === undefined ? {} : { [key]: text(p[key], 1000) };
  const result: GameplayPresentation3D = { title: text(p.title, 160), ...optional('objective'), ...optional('hint'), ...optional('status') };
  if (p.reticle !== undefined) { if (typeof p.reticle !== 'boolean') throw new Error('Invalid reticle');result.reticle = p.reticle; }
  if (p.layout !== undefined) {
    if (p.layout !== 'menu' && p.layout !== 'intro' && p.layout !== 'countdown' && p.layout !== 'fight' && p.layout !== 'result') throw new Error('Invalid 3D gameplay layout.');
    result.layout = p.layout;
  }
  if (p.metrics !== undefined) result.metrics = list(p.metrics, 8).map(raw => {
    const m = object(raw);
    if ((m.current !== undefined || m.max !== undefined) && (typeof m.current !== 'number' || !Number.isFinite(m.current) || typeof m.max !== 'number' || !Number.isFinite(m.max) || m.max <= 0 || m.current < 0 || m.current > m.max)) throw new Error('Invalid 3D metric range.');
    return { label: text(m.label, 80), value: text(m.value, 160), ...(typeof m.current === 'number' && typeof m.max === 'number' ? { current: m.current, max: m.max } : {}) };
  });
  if (p.actions !== undefined) result.actions = list(p.actions, 12).map(raw => {
    const a = object(raw), disabled = a.disabled, held = a.held;
    if (disabled !== undefined && typeof disabled !== 'boolean') throw new Error('Invalid 3D action disabled state.');
    if (held !== undefined && typeof held !== 'boolean') throw new Error('Invalid 3D action held state.');
    let range: { min: number; max: number; value: number } | undefined;
    if (a.range !== undefined) {
      const r = object(a.range);
      if (typeof r.min !== 'number' || typeof r.max !== 'number' || typeof r.value !== 'number' || !Number.isSafeInteger(r.min) || !Number.isSafeInteger(r.max) || !Number.isSafeInteger(r.value) || r.min >= r.max || r.value < r.min || r.value > r.max || a.held) throw new Error('Invalid 3D action range.');
      range = { min: r.min, max: r.max, value: r.value };
    }
    return { action: text(a.action, 120), label: text(a.label, 100), ...(disabled === undefined ? {} : { disabled }), ...(held === undefined ? {} : { held }), ...(range ? { range } : {}) };
  });
  if (p.overlay !== undefined) { const o = object(p.overlay);result.overlay = { title: text(o.title, 160), body: text(o.body, 2000) }; }
  if (p.interactionTargets !== undefined) {
    const entries = Object.entries(object(p.interactionTargets));
    if (entries.length > 16) throw new Error('Oversized interaction targets.');
    result.interactionTargets = Object.fromEntries(entries.map(([id, target]) => [text(id, 160), text(target, 160)]));
  }
  return result;
}
export function readGameplayAudio3D(value: unknown, assets: ReadonlySet<string>): GameplayAudio3D[] {
  return list(value, 16).map(raw => { const a = object(raw), assetId = text(a.assetId, 160);if (!assets.has(assetId)) throw new Error(`Unknown 3D audio asset ${assetId}.`);
    const gain = a.gain ?? 1;if (typeof gain !== 'number' || !Number.isFinite(gain) || gain < 0 || gain > 1) throw new Error('3D audio gain must be from zero to one.');
    const pan = a.pan ?? 0;if (typeof pan !== 'number' || !Number.isFinite(pan) || pan < -1 || pan > 1) throw new Error('3D audio pan must be from minus one to one.');
    if (a.loop !== undefined && typeof a.loop !== 'boolean') throw new Error('3D audio loop must be boolean.');
    const bus = a.bus ?? 'sfx';if (bus !== 'music' && bus !== 'sfx' && bus !== 'voice' && bus !== 'ambient') throw new Error('Unknown 3D audio bus.');
    if (a.playlist !== undefined && (bus !== 'music' || typeof a.playlist !== 'string' || !a.playlist.trim() || a.playlist.length > 64)) throw new Error('3D audio playlist needs a music bus and an identifier of one to 64 characters.');
    if (a.musicIntensity !== undefined && (bus !== 'music' || typeof a.musicIntensity !== 'number' || !Number.isFinite(a.musicIntensity) || a.musicIntensity < 0 || a.musicIntensity > 1)) throw new Error('3D music intensity needs a music bus and a finite value from zero to one.');
    const mix: Pick<GameplayAudio3D, 'priority' | 'duckMusic' | 'duckSeconds' | 'fadeSeconds'> = {};
    if (a.category !== undefined && a.category !== 'voice') throw Error('Unknown 3D audio category.');
    if (a.playbackRate !== undefined && (typeof a.playbackRate !== 'number' || !Number.isFinite(a.playbackRate) || a.playbackRate < .25 || a.playbackRate > 4)) throw Error('3D audio playback rate must be from .25 to four.');
    if (a.impactStrength !== undefined && (typeof a.impactStrength !== 'number' || !Number.isFinite(a.impactStrength) || a.impactStrength < 0 || a.impactStrength > 1)) throw Error('3D audio impact strength must be from zero to one.');
    for (const key of ['priority', 'duckMusic', 'duckSeconds', 'fadeSeconds'] as const) if (a[key] !== undefined) {
      const n = a[key];
      if (typeof n !== 'number' || !Number.isFinite(n) || key !== 'priority' && (n < 0 || n > (key === 'duckMusic' ? 1 : 10))) throw new Error(`Invalid 3D audio ${key}.`);
      mix[key] = n;
    }
    return { assetId, gain, pan, loop: a.loop === true, bus, ...(a.category === 'voice' ? { category: a.category } : {}), ...(typeof a.playbackRate === 'number' ? { playbackRate: a.playbackRate } : {}), ...(typeof a.impactStrength === 'number' ? { impactStrength: a.impactStrength } : {}), ...(typeof a.playlist === 'string' ? { playlist: a.playlist } : {}), ...(typeof a.musicIntensity === 'number' ? { musicIntensity: a.musicIntensity } : {}), ...mix };
  });
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Expected a plain 3D gameplay object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown, max: number): string { return requireText(value, { max, message: "Invalid or oversized 3D presentation text." }); }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) throw new Error('Oversized 3D presentation list.');return value; }
