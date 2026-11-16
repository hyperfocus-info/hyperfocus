import { readCombatEnvironment } from './combat-environment/config.ts';
import { createCombatPreset, type CombatConfig } from '../../combat/config.ts';
import { readCombatConfig } from '../../combat/read.ts';
import { readCombatAudio3D, type CombatAudio3D } from './combat-audio-config.ts';
import { readCombatInteractions } from './combat-interaction/config.ts';
import { readCombatArenaLayouts, type CombatArenaLayouts } from './combat-match/arena-layouts.ts';
import { readCombatWeaponLayouts, type CombatWeaponLayouts } from './combat-match/weapon-layouts.ts';

export type CombatProject3D = {
  version: 1;
  config: CombatConfig;
  match?: { difficulty: number };
  /** Match starting positions, one per fighter in declaration order. */
  spawns?: Array<{ id: string; positions: Array<[number, number, number]>; props?: Array<{ entityId: string; position: [number, number, number] }> }>;
  /** Per-district prop arrangements selected at a new match, independently of fighter starts. */
  weaponLayouts?: CombatWeaponLayouts;
  /** Structural positions selected once per match, independently of fighter starts and inventory. */
  arenaLayouts?: CombatArenaLayouts;
  audio?: CombatAudio3D;
  environment?: NonNullable<ReturnType<typeof readCombatEnvironment>>;
  interactions?: NonNullable<ReturnType<typeof readCombatInteractions>>;
  movement?: { speed: number; jumpSpeed: number; dashSpeed: number; dashFrames: number; dashRecoveryFrames: number; separateJump?: boolean; jumpHoldFrames?: number; jumpHoldGravityScale?: number; jumpReleaseSpeedRatio?: number;
    autoStepHeight?: number; autoStepSpeedScale?: number; accelerationScale?: number; exhaustedMovementScale?: number; sprintSpeed?: number; sprintHoldFrames?: number; coastDeceleration?: number; stepCost?: number; sprintCost?: number; jumpCost?: number; jumpBufferFrames?: number; coyoteFrames?: number; airSteering?: number; airJumps?: number; wallSlideSpeed?: number; wallRunFrames?: number; wallRunSpeed?: number; wallRunCost?: number; wallJumpCost?: number; wallJumpSpeed?: number; wallJumpPushSpeed?: number; dashEndSpeedRatio?: number };
  fighters: Array<{ entityId: string; control: 'player' | 'dummy' | 'sparring'; actionPrefix: string }>;
};

export function createCombatProject3D(): CombatProject3D {
  return { version: 1, config: createCombatPreset(), fighters: [] };
}

/** Shared import, authoring, Play and build validation. */
export function readCombatProject3D(value: unknown): CombatProject3D | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('config' in value) || !('fighters' in value) || !Array.isArray(value.fighters)) throw new Error('Combat needs version 1, config and fighters.');
  rejectUnknown(value, ['version', 'config', 'fighters', 'movement', 'match', 'audio', 'interactions', 'environment', 'spawns', 'weaponLayouts', 'arenaLayouts']);
  let match: CombatProject3D['match'];
  if ('match' in value && value.match !== undefined) {
    const raw = value.match;
    if (!raw || typeof raw !== 'object' || !('difficulty' in raw) || typeof raw.difficulty !== 'number' || !Number.isInteger(raw.difficulty) || raw.difficulty < 1 || raw.difficulty > 9) throw new Error('Match difficulty must be an integer from 1 to 9.');
    rejectUnknown(raw, ['difficulty']); match = { difficulty: raw.difficulty };
  }
  let movement: CombatProject3D['movement'];
  if ('movement' in value && value.movement !== undefined) {
    const raw = value.movement;
    if (!raw || typeof raw !== 'object') throw new Error('Combat movement must be an object.');
    const optional = ['autoStepHeight', 'autoStepSpeedScale', 'accelerationScale', 'exhaustedMovementScale', 'sprintSpeed', 'sprintHoldFrames', 'coastDeceleration', 'stepCost', 'sprintCost', 'jumpCost', 'jumpBufferFrames', 'coyoteFrames', 'airSteering', 'airJumps', 'wallSlideSpeed', 'wallRunFrames', 'wallRunSpeed', 'wallRunCost', 'wallJumpCost', 'wallJumpSpeed', 'wallJumpPushSpeed', 'dashEndSpeedRatio', 'jumpHoldFrames', 'jumpHoldGravityScale', 'jumpReleaseSpeedRatio'];
    rejectUnknown(raw, ['speed', 'jumpSpeed', 'dashSpeed', 'dashFrames', 'dashRecoveryFrames', 'separateJump', ...optional]);
    const number = (key: string, frames = false) => {
      const item: unknown = Reflect.get(raw, key);
      if (typeof item !== 'number' || !Number.isFinite(item) || item < 0 || item > (frames ? 600 : 100) || (frames && !Number.isInteger(item))) throw new Error(`Invalid combat movement ${key}.`);
      return item;
    };
    movement = { speed: number('speed'), jumpSpeed: number('jumpSpeed'), dashSpeed: number('dashSpeed'), dashFrames: number('dashFrames', true), dashRecoveryFrames: number('dashRecoveryFrames', true) };
    if ('separateJump' in raw) { if (typeof raw.separateJump !== 'boolean') throw new Error('Separate jump must be a boolean.');movement.separateJump = raw.separateJump; }
    for (const key of optional) if (Reflect.get(raw, key) !== undefined) Object.assign(movement, { [key]: number(key, key.endsWith('Frames') || key === 'airJumps') });
  }
  if ((movement?.autoStepHeight ?? 0) > 1.5 || (movement?.autoStepSpeedScale ?? 1) > 1) throw new Error('Invalid auto-step height or speed scale.');
  if ((movement?.accelerationScale ?? 1) > 1 || (movement?.exhaustedMovementScale ?? 1) > 1) throw new Error('Movement acceleration and exhausted movement scales must be between zero and one.');
  if ((movement?.airJumps ?? 0) > 1 || (movement?.dashEndSpeedRatio ?? 1) > 1) throw new Error('Air jumps and dash end speed ratio must be between zero and one.');
  if ((movement?.jumpHoldFrames ?? 0) > 30 || (movement?.jumpHoldGravityScale ?? 1) > 1) throw new Error('Jump hold is limited to 30 frames and gravity scale to zero through one.');
  if ((movement?.jumpReleaseSpeedRatio ?? 1) > 1) throw new Error('Jump release speed ratio must be between zero and one.');
  if (value.fighters.length > 16) throw new Error('Combat supports at most 16 fighters.');
  const ids = new Set<string>();
  const fighters = value.fighters.map((item: unknown): CombatProject3D['fighters'][number] => {
    if (!item || typeof item !== 'object' || !('entityId' in item) || typeof item.entityId !== 'string' || !item.entityId || item.entityId.length > 160 || ids.has(item.entityId)) throw new Error('Combat fighter IDs must be unique scene entity IDs.');
    if (!('control' in item) || (item.control !== 'player' && item.control !== 'dummy' && item.control !== 'sparring')) throw new Error('Choose player, dummy or sparring control.');
    if (!('actionPrefix' in item) || typeof item.actionPrefix !== 'string' || !/^[a-zA-Z0-9_-]{1,64}:$/.test(item.actionPrefix)) throw new Error('Combat action prefix must be a short name followed by a colon.');
    rejectUnknown(item, ['entityId', 'control', 'actionPrefix']);
    ids.add(item.entityId);
    return { entityId: item.entityId, control: item.control, actionPrefix: item.actionPrefix };
  });
  if (fighters.filter(fighter => fighter.control === 'player').length > 1) throw new Error('Editor Play supports one local player. Use dummy or sparring for opponents; network hosts supply each fighter input directly.');
  if (new Set(fighters.map(fighter => fighter.actionPrefix)).size !== fighters.length) throw new Error('Each fighter needs its own action prefix.');
  if (match && (fighters.length !== 2 || !fighters.some(fighter => fighter.control === 'player'))) throw new Error('Match mode needs one player and one opponent.');
  const audio = readCombatAudio3D('audio' in value ? value.audio : undefined, fighters.map(fighter => fighter.entityId));
  const environment = readCombatEnvironment('environment' in value ? value.environment : undefined);
  const interactions = readCombatInteractions('interactions' in value ? value.interactions : undefined);
  const weaponLayouts = readCombatWeaponLayouts('weaponLayouts' in value ? value.weaponLayouts : undefined, interactions?.weapons.map(weapon => weapon.entityId) ?? []);
  const config = readCombatConfig(value.config);
  let spawns: CombatProject3D['spawns'];
  if ('spawns' in value && value.spawns !== undefined) {
    if (!Array.isArray(value.spawns) || !value.spawns.length || value.spawns.length > 32) throw new Error('Choose between 1 and 32 round starting locations.');
    const names = new Set<string>();
    spawns = value.spawns.map((spawn: unknown) => {
      if (!spawn || typeof spawn !== 'object' || !('id' in spawn) || typeof spawn.id !== 'string' || !spawn.id.trim() || spawn.id.length > 160 || names.has(spawn.id)) throw new Error('Starting locations need unique names.');
      rejectUnknown(spawn, ['id', 'positions', 'props']); names.add(spawn.id);
      if (!('positions' in spawn) || !Array.isArray(spawn.positions) || spawn.positions.length !== fighters.length) throw new Error('Starting locations need one position per fighter.');
      const positions = spawn.positions.map((position: unknown): [number, number, number] => {
        if (!Array.isArray(position) || position.length !== 3 || position.some(component => typeof component !== 'number' || !Number.isFinite(component) || Math.abs(component) > 100000)) throw new Error('Starting positions need three finite coordinates.');
        return [position[0], position[1], position[2]];
      });
      let props: NonNullable<CombatProject3D['spawns']>[number]['props'];
      if ('props' in spawn && spawn.props !== undefined) {
        if (!Array.isArray(spawn.props) || spawn.props.length > 128) throw new Error('A starting location supports up to 128 prop placements.');
        const ids = new Set<string>();
        props = spawn.props.map((prop: unknown) => {
          if (!prop || typeof prop !== 'object' || !('entityId' in prop) || typeof prop.entityId !== 'string' || !prop.entityId.trim() || prop.entityId.length > 160 || ids.has(prop.entityId) || fighters.some(fighter => fighter.entityId === prop.entityId)) throw new Error('Prop placements need unique non-fighter object IDs.');
          rejectUnknown(prop, ['entityId', 'position']);ids.add(prop.entityId);
          if (!('position' in prop) || !Array.isArray(prop.position) || prop.position.length !== 3 || prop.position.some(value => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000)) throw new Error('Prop positions need three finite coordinates.');
          return { entityId: prop.entityId, position: [prop.position[0], prop.position[1], prop.position[2]] };
        });
      }
      return { id: spawn.id, positions, ...(props ? { props } : {}) };
    });
  }
  const arenaLayouts = readCombatArenaLayouts('arenaLayouts' in value ? value.arenaLayouts : undefined, [...fighters.map(fighter => fighter.entityId), ...(interactions?.weapons ?? []).map(weapon => weapon.entityId), ...(spawns ?? []).flatMap(spawn => (spawn.props ?? []).map(prop => prop.entityId))]);
  for (const weapon of interactions?.weapons ?? []) for (const id of [weapon.lightMoveId, weapon.heavyMoveId]) if (!config.moves.some(move => move.id === id)) throw new Error(`Unknown weapon move: ${id}`);
  return { version: 1, config, fighters, ...(spawns ? { spawns } : {}), ...(weaponLayouts ? { weaponLayouts } : {}), ...(arenaLayouts ? { arenaLayouts } : {}), ...(environment ? { environment } : {}), ...(movement ? { movement } : {}), ...(match ? { match } : {}), ...(audio ? { audio } : {}), ...(interactions ? { interactions } : {}) };
}

function rejectUnknown(value: object, keys: readonly string[]) {
  const extra = Object.keys(value).find(key => !keys.includes(key));
  if (extra !== undefined) throw new Error(`Unknown combat field: ${extra}`);
}
