import { createAuthoritativeServer as createAuthoritativeServerBase, type AuthoritativeRoom, type AuthoritativeServer, type AuthoritativeServerOptions } from "@hyperfocus/engine/server";
import { type MmoSkillDemoInput, type MmoSkillDemoState } from "../shared-contracts.ts";
import { requireMmoSkillDemoRoom } from "../shared-room-runtime.ts";

type MmoSkillDemoTestRoom = AuthoritativeRoom<MmoSkillDemoState, MmoSkillDemoInput>;

type MmoSkillDemoTestServer = Omit<AuthoritativeServer, "createRoom" | "joinRoom" | "rooms"> & {
  createRoom(typeName: string, roomId?: string): MmoSkillDemoTestRoom;
  joinRoom(options: Parameters<AuthoritativeServer["joinRoom"]>[0]): Promise<
    Omit<Awaited<ReturnType<AuthoritativeServer["joinRoom"]>>, "room"> & { room?: MmoSkillDemoTestRoom }
  >;
  rooms(): readonly MmoSkillDemoTestRoom[];
};

function createAuthoritativeServer(options: AuthoritativeServerOptions): MmoSkillDemoTestServer {
  const server = createAuthoritativeServerBase({ ...options, devMode: options.devMode ?? true });
  return {
    ...server,
    createRoom(typeName: string, roomId?: string) {
      return requireMmoSkillDemoRoom(server.createRoom(typeName, roomId));
    },
    async joinRoom(joinOptions) {
      const result = await server.joinRoom(joinOptions);
      return result.ok ? { ...result, room: requireMmoSkillDemoRoom(result.room) } : result;
    },
    rooms() {
      return server.rooms().map(requireMmoSkillDemoRoom);
    }
  };
}

async function tapPummel(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, input: Record<string, unknown>) {
  await server.receiveInput(playerId, { ...input, action: input.action === "attack" ? "attack" : "lmb" });
  await server.tick(0);
  await server.receiveInput(playerId, { action: "idle", targetId: input.targetId ?? "", aimX: input.aimX, aimY: input.aimY });
  await server.tick(0.36);
}

async function castCrushingLeap(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, input: Record<string, unknown>) {
  await server.receiveInput(playerId, { ...input, action: "rmb" });
  await server.tick(0);
  await server.tick(0.7);
}

async function sendConfig(server: { receiveInput: (playerId: string, input: Record<string, unknown>) => Promise<unknown>; tick: (dt?: number) => Promise<unknown> }, playerId: string, devField: string, devText: string) {
  await server.receiveInput(playerId, { action: "config", devField, devText });
  await server.tick(0);
}

const supportNpcRoles = new Set(["quest", "trainer", "bank", "merchant", "travel", "contract", "crafting", "hidden", "home"]);

function isolateCombatTarget(state: MmoSkillDemoState, targetId: string) {
  for (const npc of Object.values(state.npcs)) {
    if (npc.id === targetId || supportNpcRoles.has(npc.role) || npc.role === "boss-node") continue;
    npc.zoneId = "dungeon";
    npc.x += 200000;
    npc.y += 200000;
    npc.spawnX = npc.x;
    npc.spawnY = npc.y;
  }
  const target = state.npcs[targetId];
  if (target) {
    target.attackCooldownMs = 30000;
    target.projectileCooldownMs = 30000;
    target.stunMs = 30000;
  }
}

export {
  castCrushingLeap,
  createAuthoritativeServer,
  isolateCombatTarget,
  sendConfig,
  supportNpcRoles,
  tapPummel
};

export type {
  MmoSkillDemoTestRoom,
  MmoSkillDemoTestServer
};
