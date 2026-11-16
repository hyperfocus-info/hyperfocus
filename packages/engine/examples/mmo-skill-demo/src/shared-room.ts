import { tileToWorld } from "@hyperfocus/engine";
import { getMmoSkillDemoAnchorTile } from "./data/world.ts";
import { createRoomType, updateTransientEffects, type RoomReplicationOptions } from "@hyperfocus/engine/server";
import { saveCharacterForUser, savedCharacterForUser } from "./persistence.ts";
import { mmoSkillDemoSchema } from "./schema.ts";
import { recordRewindSample } from "./shared-combat-player.ts";
import { type MmoSkillDemoInput, type MmoSkillDemoState } from "./shared-contracts.ts";
import { entitiesOfType, flushMmoEntityPools, mmoSkillDemoSharedHotPoolForState, syncMmoEntityRegistry } from "./shared-entity-registry.ts";
import { updateGatheringInteractions } from "./shared-gathering.ts";
import { updateHazards } from "./shared-hazards.ts";
import { decayPlayerCooldowns } from "./shared-loadout.ts";
import { applyMovement } from "./shared-movement.ts";
import { updateNpcs } from "./shared-npc-ai.ts";
import { applyPlayerAction } from "./shared-player-actions.ts";
import { updateWorldEvent } from "./shared-progression.ts";
import { buildMmoSkillDemoMultipartReplication, buildMmoSkillDemoSnapshotForPlayer, markStaticSegmentsAcked, markStaticSegmentsSent, mmoSkillDemoRoomTelemetry } from "./shared-replication.ts";
import { cleanInputText, cleanItemId, normalizeAxis, normalizeWorldCoord, validAction } from "./shared-replication-projection.ts";
import { ensureRuntime } from "./shared-room-runtime.ts";
import { createMmoSkillDemoState, createPlayer, defaultWorldPosition } from "./shared-world-state.ts";
import { isRoomKind, mmoSkillDemoMap } from "./shared-world-runtime.ts";
import { updateLoots, updatePlayerProgression, updateResources, upsertInterestEntities } from "./shared-world-update.ts";

function createMmoSkillDemoRoomType(options: { name: string; maxPlayers: number; replication?: RoomReplicationOptions }) {
  return createRoomType<MmoSkillDemoState, MmoSkillDemoInput>({
    name: options.name,
    schema: mmoSkillDemoSchema,
    maxPlayers: options.maxPlayers,
    replication: options.replication,
    idleDisposeMs: 60000,
    createState: (ctx) => createMmoSkillDemoState(ctx.roomId),
    onJoin(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      const actor = mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        if (!isRoomKind(ctx.state.roomKind)) throw new Error(`Unknown MMO room kind: ${ctx.state.roomKind}`);
        ctx.state.players[player.id] = createPlayer(
          player.id,
          player.userId,
          savedCharacterForUser(player.userId),
          ctx.state.roomKind,
          ctx.roomId
        );
        ctx.state.activePlayers = ctx.players.size;
        syncMmoEntityRegistry(ctx.state);
        return ctx.state.players[player.id];
      });
      runtime.inputs.set(player.id, { dx: 0, dy: 0, action: "idle", targetId: "", aimX: actor.x, aimY: actor.y, itemId: "", devField: "", devValue: 0, devText: "" });
    },
    onLeave(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      const active = ctx.state.players[player.id];
      if (active) {
        saveCharacterForUser(player.userId, active, {
          preserveWorldPosition: ctx.state.roomKind === "dungeon-instance" || ctx.state.roomKind === "cottage-instance",
          fallbackWorldPosition: defaultWorldPosition(player.id)
        });
      }
      mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        delete ctx.state.players[player.id];
        ctx.state.activePlayers = ctx.players.size;
        syncMmoEntityRegistry(ctx.state);
      });
      runtime.inputs.delete(player.id);
      runtime.grid.remove(player.id);
      runtime.logicHash.remove(player.id);
      runtime.interestCache.delete(player.id);
      runtime.grid.clearClient(player.id);
      runtime.staticEntitiesByPlayer.delete(player.id);
      runtime.staticDiscoveryQueueByPlayer.delete(player.id);
      runtime.staticAcksByPlayer.delete(player.id);
    },
    onInput(ctx, player, input) {
      const runtime = ensureRuntime(ctx.roomId);
      runtime.inputs.set(player.id, {
        dx: normalizeAxis(input.dx),
        dy: normalizeAxis(input.dy),
        action: validAction(input.action),
        targetId: typeof input.targetId === "string" ? input.targetId.slice(0, 32) : "",
        aimX: normalizeWorldCoord(input.aimX, ctx.state.players[player.id]?.x ?? 0, mmoSkillDemoMap.pixelWidth),
        aimY: normalizeWorldCoord(input.aimY, ctx.state.players[player.id]?.y ?? 0, mmoSkillDemoMap.pixelHeight),
        itemId: cleanItemId(input.itemId),
        devField: cleanInputText(input.devField, 32),
        devValue: Number.isFinite(input.devValue) ? Number(input.devValue) : 0,
        devText: cleanInputText(input.devText, 192)
      });
    },
    async update(ctx, dt) {
      const runtime = ensureRuntime(ctx.roomId);
      const kernel = await runtime.kernel;
      mmoSkillDemoSharedHotPoolForState(ctx.state).withTick(() => {
        ctx.state.tick += 1;
        ctx.state.activePlayers = ctx.players.size;
        for (const player of entitiesOfType(ctx.state, "player")) {
          const input = runtime.inputs.get(player.id) ?? { dx: 0, dy: 0, action: "idle", targetId: "", aimX: player.x, aimY: player.y, itemId: "", devField: "", devValue: 0, devText: "" };
          decayPlayerCooldowns(player, dt);
          applyMovement(ctx.state, kernel, player, input, dt);
          applyPlayerAction(ctx.state, kernel, player, input);
        }
        updateGatheringInteractions(ctx.state, dt);
        upsertInterestEntities(runtime, ctx.state);
        updateNpcs(ctx.state, runtime, kernel, dt);
        updateHazards(ctx.state, kernel, dt);
        updateTransientEffects(ctx.state.effects, dt);
        updateResources(ctx.state, dt);
        updateLoots(ctx.state, dt);
        updatePlayerProgression(ctx.state, dt);
        for (const player of entitiesOfType(ctx.state, "player")) recordRewindSample(player, dt);
        updateWorldEvent(ctx.state, dt);
        upsertInterestEntities(runtime, ctx.state);
        syncMmoEntityRegistry(ctx.state);
        flushMmoEntityPools();
      });
    },
    getInterestTarget(ctx, player) {
      const fallback = getMmoSkillDemoAnchorTile("aetheria");
      const actor = ctx.state.players[player.id] ?? tileToWorld(mmoSkillDemoMap, fallback.x, fallback.y, "center");
      const rushing = "activeAbility" in actor && actor.activeAbility === "space-rush";
      return { x: actor.x, y: actor.y, radius: ctx.state.roomKind === "dungeon-instance" ? (rushing ? 1100 : 820) : rushing ? 1100 : 720 };
    },
    getSnapshot(ctx, player) {
      const runtime = ensureRuntime(ctx.roomId);
      return buildMmoSkillDemoSnapshotForPlayer(ctx, runtime, player);
    },
    getReplication(ctx, player, request) {
      const runtime = ensureRuntime(ctx.roomId);
      return buildMmoSkillDemoMultipartReplication(ctx, runtime, player, request);
    },
    onReplicationSent(ctx, player, receipt) {
      markStaticSegmentsSent(ensureRuntime(ctx.roomId), player.id, receipt.sequence, receipt.segments, receipt.now);
    },
    onReplicationAck(ctx, player, sequence) {
      markStaticSegmentsAcked(ensureRuntime(ctx.roomId), player.id, sequence);
    },
    onReplicationTelemetry(ctx, telemetry) {
      ensureRuntime(ctx.roomId).replicationAdaptive = telemetry.adaptive;
    },
    getRoomTelemetry(ctx) {
      return mmoSkillDemoRoomTelemetry(ctx, ensureRuntime(ctx.roomId));
    }
  });
}

export const mmoSkillDemoZone = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo",
  maxPlayers: 100,
  replication: { snapshotRate: 1, deltaRate: 10 }
});

export const mmoSkillDemoDungeon = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo-dungeon",
  maxPlayers: 20,
  replication: { snapshotRate: 1, deltaRate: 6, maxBytesPerClientPerSecond: 32768 }
});

export const mmoSkillDemoCottage = createMmoSkillDemoRoomType({
  name: "mmo-skill-demo-cottage",
  maxPlayers: 8,
  replication: { snapshotRate: 1, deltaRate: 10 }
});

export {
  createMmoSkillDemoRoomType
};
