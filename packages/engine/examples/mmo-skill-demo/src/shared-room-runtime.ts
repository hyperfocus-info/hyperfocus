import { createInterestGrid, createSpatialHash, type AuthoritativeRoom } from "@hyperfocus/engine/server";
import { type LogicSpatialEntity, type MmoSkillDemoInput, type MmoSkillDemoState } from "./shared-contracts.ts";
import { type ZoneRuntime } from "./shared-runtime-contracts.ts";
import { createMmoSkillDemoCollisionKernel } from "./shared-world-runtime.ts";

const runtimeByRoom = new Map<string, ZoneRuntime>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isMmoSkillDemoState(value: unknown): value is MmoSkillDemoState {
  if (!isRecord(value)) return false;
  return typeof value.tick === "number"
    && typeof value.roomKind === "string"
    && Array.isArray(value.effects)
    && isRecord(value.entities)
    && isRecord(value.players)
    && isRecord(value.npcs)
    && isRecord(value.resources)
    && isRecord(value.loots)
    && isRecord(value.hazards);
}

function isMmoSkillDemoRoom(room: AuthoritativeRoom): room is AuthoritativeRoom<MmoSkillDemoState, MmoSkillDemoInput> {
  return isMmoSkillDemoState(room.ctx.state);
}

function requireMmoSkillDemoRoom(room: AuthoritativeRoom): AuthoritativeRoom<MmoSkillDemoState, MmoSkillDemoInput> {
  if (!isMmoSkillDemoRoom(room)) throw new Error(`Room ${room.id} does not expose MMO Skill Demo state.`);
  return room;
}

function ensureRuntime(roomId: string): ZoneRuntime {
  let runtime = runtimeByRoom.get(roomId);
  if (!runtime) {
    runtime = {
      grid: createInterestGrid({ cellSize: 160, maxEntitiesPerClient: 96, maxEntitiesPerClientByType: { hazard: 16 }, hysteresisCells: 1 }),
      interestIds: new Set(),
      nextInterestIds: new Set(),
      interestCache: new Map(),
      interestScratch: { id: "", type: "", x: 0, y: 0, radius: 0, priority: 0 },
      logicHash: createSpatialHash<LogicSpatialEntity>({ cellSize: 160 }),
      logicIds: new Set(),
      nextLogicIds: new Set(),
      logicScratch: [],
      staticEntitiesByPlayer: new Map(),
      staticDiscoveryQueueByPlayer: new Map(),
      staticAcksByPlayer: new Map(),
      staticSignatureBySegmentId: new Map(),
      staticCellSegmentsBySignature: new Map(),
      volatileCellsByPlayer: new Map(),
      staticTtdSamples: [],
      inputs: new Map(),
      kernel: createMmoSkillDemoCollisionKernel()
    };
    runtimeByRoom.set(roomId, runtime);
  }
  return runtime;
}

export {
  ensureRuntime,
  requireMmoSkillDemoRoom,
  runtimeByRoom
};
