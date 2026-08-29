import { expect, test } from "bun:test";
import { sortRenderCallsByY, type Renderable } from "@hyperfocus/engine/render";
import { abilityTooltip } from "../client/ability-tooltips.ts";
import { clientTransientEffectTiming, RENDER_LAYER_CONFIG } from "../client/render.ts";
import { createAimReticleRenderCalls, createVisualEffectQueue } from "../client/render/effects.ts";
import { createHudRenderCalls } from "../client/render/hud.ts";
import { createHazardRenderCalls } from "../client/render/hazards.ts";
import { createImpactFeedbackController } from "../client/render/impact.ts";
import { createLootRenderCalls } from "../client/render/loot.ts";
import { createNpcRenderCalls } from "../client/render/npcs.ts";
import { createRenderSignalTracker, impactFeedbackForAbility } from "../client/render/signals.ts";
import { createResourceRenderCalls } from "../client/render/resources.ts";
import { createCompactPanelState } from "../client/ui-shell.ts";
import { createDefaultMapFilterState, mapFilterSignature, mapNodeTooltipInfoForResource, toggleMapFilter } from "../client/map-overlay.ts";
import { slotCooldownMs } from "../client/combat-view.ts";
import { worldGatherableNodeSpecs } from "../data/world-gatherables.ts";
import { type HazardEntity, type LootEntity, type ResourceEntity } from "../shared-contracts.ts";
import { flattenRenderCalls, inspectRender, inspectRenderCalls, npc, player, state } from "./render-test-fixtures.ts";


test("impact feedback profiles cover all weapons with bounded hierarchy", () => {
  const lightAbilities = ["mace-pummel", "bow-quick-shot", "staff-arcane-bolt", "wand-hex", "twin-strike", "blade-cleave"];
  for (const abilityId of lightAbilities) {
    const profile = impactFeedbackForAbility(abilityId, 7);
    expect(profile.hitstopMs).toBeGreaterThanOrEqual(24);
    expect(profile.targetHoldMs).toBeGreaterThanOrEqual(26);
    expect(profile.shakePx).toBeLessThanOrEqual(1);
  }

  const maceLight = impactFeedbackForAbility("mace-pummel", 7);
  const bowLight = impactFeedbackForAbility("bow-quick-shot", 7);
  const bladeHeavy = impactFeedbackForAbility("blade-brutal-strike", 28);
  const staffUltimate = impactFeedbackForAbility("staff-maelstrom", 18);
  const bossUltimate = impactFeedbackForAbility("mace-whirlwind", 35, { targetRole: "boss", killed: true });

  expect(bowLight.targetHoldMs).toBeLessThan(maceLight.targetHoldMs);
  expect(bladeHeavy.hitstopMs).toBeGreaterThan(maceLight.hitstopMs);
  expect(staffUltimate.hitstopMs).toBeGreaterThan(bladeHeavy.hitstopMs);
  expect(bossUltimate.shakePx).toBeLessThanOrEqual(4);
  expect(bossUltimate.effectScale).toBeGreaterThan(staffUltimate.effectScale);
});

test("impact feedback controller holds actors briefly and keeps shake mild", () => {
  const impacts = createImpactFeedbackController();
  impacts.push({
    actorId: "npc-1",
    sourceId: "p1",
    x: 140,
    y: 160,
    sourceX: 100,
    sourceY: 160,
    directionX: 1,
    directionY: 0,
    startedMs: 1000,
    targetHoldMs: 90,
    attackerHoldMs: 35,
    shakeMs: 90,
    shakePx: 2.2,
    weight: "heavy"
  });

  const npcVisual = impacts.actorVisual("npc-1", 1020);
  const playerVisual = impacts.actorVisual("p1", 1020);
  const shaken = impacts.camera({ x: 0, y: 0 }, 1020, 960, 540);

  expect(npcVisual?.x).toBe(140);
  expect(playerVisual?.x).toBe(100);
  expect(Math.hypot(shaken.x, shaken.y)).toBeLessThanOrEqual(4.5);
  expect(impacts.actorVisual("npc-1", 1120)).toBeUndefined();
});

test("render signal tracker themes player ability NPC impacts", () => {
  const played: string[] = [];
  const pushed: Array<Record<string, unknown>> = [];
  const impacts: Array<Record<string, unknown>> = [];
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    sfx: { unlock() {}, play(event) { played.push(event); } },
    impact: { push(signal) { impacts.push(signal); } },
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat(text, x, y, color, timeMs, size) { pushed.push({ kind: "float", text, x, y, color, startedMs: timeMs, size }); },
      pushBurst(x, y, color, timeMs, size, text) { pushed.push({ kind: "burst", x, y, color, startedMs: timeMs, size, text }); }
    }
  });
  const attacker = player({
    action: "lmb",
    targetId: "npc-1",
    equipment: { weapon: "bow" },
    abilitySlots: { LMB: "unlocked", "bow-quick-shot": "LMB" }
  });
  const before = npc({ id: "npc-1", hp: 20, maxHp: 20, impactType: "dust" });

  tracker.sync(state({ players: { p1: attacker }, npcs: { "npc-1": before } }), 1000);
  tracker.sync(state({ players: { p1: attacker }, npcs: { "npc-1": { ...before, hp: 12 } } }), 1040);

  expect(played).toContain("bow-impact");
  expect(pushed.some((effect) => effect.kind === "burst" && effect.color === "#9bd6ff")).toBe(true);
  expect(impacts.some((impact) => impact.actorId === "npc-1" && impact.sourceId === "p1" && impact.weight === "light")).toBe(true);
  expect(impacts.every((impact) => typeof impact.shakePx === "number" && impact.shakePx <= 4)).toBe(true);
});

test("boss stun renders large stagger readback", () => {
  const [group] = createNpcRenderCalls(
    npc({ kind: "dungeon-revenant", role: "boss", elite: true, stunMs: 1400 }),
    {},
    player(),
    1000
  );
  if (!group) throw new Error("Expected boss render group.");
  const calls = flattenRenderCalls([group]);

  expect(calls.some((call) => call.kind === "text" && call.text === "STAGGER")).toBe(true);
  expect(calls.some((call) => call.kind === "circle" && (call.radius ?? 0) > 50)).toBe(true);
});

test("charge signal particles are small and lightly velocity biased", () => {
  const pushed: Array<Record<string, unknown>> = [];
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat(text, x, y, color, timeMs, size) { pushed.push({ kind: "float", text, x, y, color, startedMs: timeMs, size }); },
      pushBurst(x, y, color, timeMs, size, text) { pushed.push({ kind: "burst", x, y, color, startedMs: timeMs, size, text }); }
    }
  });
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "mace-pummel", chargeMs: 100 }) } }), 1000);
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "mace-pummel", chargeMs: 260 }) } }), 1040);
  const chargeParticle = pushed.find((effect) => effect.kind === "particle");

  expect(chargeParticle?.size).toBe(4.8);
  expect(chargeParticle?.length).toBe(24);
  const velocityX = chargeParticle?.velocityX;
  const velocityY = chargeParticle?.velocityY;
  if (typeof velocityX !== "number" || typeof velocityY !== "number") throw new Error("Expected numeric charge-particle velocity");
  expect(velocityX).toBeGreaterThanOrEqual(-5);
  expect(velocityX).toBeLessThanOrEqual(5);
  expect(velocityY).toBeGreaterThanOrEqual(-5);
  expect(velocityY).toBeLessThanOrEqual(5);
});

test("render signal tracker prunes player ability particles when ability ends", () => {
  const effects = createVisualEffectQueue();
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects
  });

  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "", activeSlot: "", action: "idle" }) } }), 900);
  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "space-rush", activeSlot: "Space", action: "space", activeMs: 100, abilityVectorX: 1, abilityVectorY: 0 }) } }), 1000);
  expect(effects.active().some((effect) => effect.ownerId === "p1" && effect.abilityId === "space-rush")).toBe(true);

  tracker.sync(state({ players: { p1: player({ id: "p1", activeAbility: "", activeSlot: "", action: "idle" }) } }), 1100);
  expect(effects.active().some((effect) => effect.ownerId === "p1" && effect.abilityId === "space-rush")).toBe(false);
});

test("render signal tracker emits gathering projectile on first channel frame", () => {
  const pushed: Array<{ kind?: string; toX?: number; toY?: number }> = [];
  const tree: ResourceEntity = { id: "tree-1", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const tracker = createRenderSignalTracker({
    getClientPlayerId: () => "p1",
    effects: {
      push(effect) { pushed.push(effect); },
      pushFloat() {},
      pushBurst() {}
    }
  });

  tracker.sync(state({ players: { p1: player({ id: "p1", action: "idle" }) }, resources: { [tree.id]: tree } }), 1000);
  tracker.sync(state({ players: { p1: player({ id: "p1", action: "woodcut", targetId: tree.id, activeGatherNodeId: tree.id, activeGatherMs: 0, activeGatherTotalMs: 4000 }) }, resources: { [tree.id]: tree } }), 1016);

  expect(pushed.some((effect) => effect.kind === "beam" && effect.toX === tree.x && effect.toY === tree.y - 8)).toBe(true);
});

test("world entity calls keep world coordinates", () => {
  const [lootCall] = createLootRenderCalls({ id: "loot-1", entityType: "loot", itemId: "gold", amount: 1, zoneId: "ashwood", x: 510, y: 620, ownerId: "", expiresMs: 1000, pickupRadius: 32 }, {}, 1000);
  const [resourceCall] = createResourceRenderCalls({ id: "ore-1", entityType: "resource", kind: "ore", zoneId: "crags", x: 430, y: 540, hp: 2, maxHp: 4, depleted: false, respawnMs: 0 }, {});

  expect(typeof lootCall === "function" ? undefined : lootCall.x).toBe(510);
  expect(typeof lootCall === "function" ? undefined : lootCall.y).toBe(620);
  expect(typeof resourceCall === "function" ? undefined : resourceCall.x).toBe(430);
  expect(typeof resourceCall === "function" ? undefined : resourceCall.y).toBe(540);
});

test("loot render data keeps readable ring amount and bobbing source", () => {
  const loot: LootEntity = { id: "loot-2", entityType: "loot", itemId: "gold", amount: 7, zoneId: "ashwood", x: 100, y: 140, ownerId: "", expiresMs: 1000, pickupRadius: 32 };
  const [early] = createLootRenderCalls(loot, {}, 0);
  const [later] = createLootRenderCalls(loot, {}, 500);
  const earlyCalls = inspectRenderCalls(early);
  const laterCalls = inspectRenderCalls(later);

  expect(earlyCalls.some((call) => call.kind === "circle" && call.radius === 14 && call.stroke === "#f4d36b")).toBe(true);
  expect(earlyCalls.some((call) => call.kind === "text" && call.text === "7")).toBe(true);
  expect(earlyCalls.find((call) => call.kind === "circle" && call.radius === 9)?.y).not.toBe(laterCalls.find((call) => call.kind === "circle" && call.radius === 9)?.y);
});

test("hud is the only camera-ignored layer", () => {
  expect(RENDER_LAYER_CONFIG.hud.ignoreCamera).toBe(true);
  for (const [name, config] of Object.entries(RENDER_LAYER_CONFIG)) {
    if (name !== "hud") expect(config.ignoreCamera ?? false).toBe(false);
  }
  expect(RENDER_LAYER_CONFIG.effects.order ?? 0).toBeGreaterThan(RENDER_LAYER_CONFIG.world.order ?? 0);
  expect(RENDER_LAYER_CONFIG.hazards.order ?? 0).toBeGreaterThan(RENDER_LAYER_CONFIG.world.order ?? 0);
});

test("visual effect queue renders rich transient effects deterministically", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "spark", x: 10, y: 20, color: "#f4d36b", startedMs: 1000, lifetimeMs: 420, size: 18, seed: 33, count: 5, spread: Math.PI / 2 });
  effects.push({ kind: "tether", x: 20, y: 30, toX: 70, toY: 60, controlX: 44, controlY: 6, color: "#9bd6ff", startedMs: 1000, lifetimeMs: 520, size: 4, seed: 44 });
  effects.pushAfterimpact(42, 55, "#ef6f4f", 1000, 28, { seed: 55, count: 6 });

  const first = effects.toRenderCalls(1160);
  const second = effects.toRenderCalls(1160);
  const nested = first.flatMap(inspectRenderCalls);
  const kinds = new Set(nested.map((call) => call.kind));

  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  expect(kinds.has("line")).toBe(true);
  expect(kinds.has("path")).toBe(true);
  expect(kinds.has("circle")).toBe(true);
  expect(kinds.has("ellipse")).toBe(true);
});

test("visual effect queue reuses expired effect objects", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "particle", x: 10, y: 20, color: "#ef6f4f", startedMs: 1000, lifetimeMs: 100, size: 18 });
  const first = effects.active()[0];

  effects.toRenderCalls(1201);
  expect(effects.active()).toHaveLength(0);
  effects.push({ kind: "ring", x: 30, y: 40, color: "#9bd6ff", startedMs: 1300, lifetimeMs: 200, size: 22 });

  const second = effects.active()[0];
  expect(second).toBe(first);
  expect(second.kind).toBe("ring");
  expect(second.color).toBe("#9bd6ff");
});

test("visual effect queue prunes matching owned effects", () => {
  const effects = createVisualEffectQueue();
  effects.push({ kind: "particle", x: 10, y: 20, color: "#9bd6ff", startedMs: 1000, lifetimeMs: 500, size: 12, ownerId: "p1", abilityId: "space-rush", cleanupOnAbilityEnd: true });
  effects.push({ kind: "ring", x: 20, y: 30, color: "#f4d36b", startedMs: 1000, lifetimeMs: 500, size: 18, ownerId: "p1", abilityId: "space-rush", cleanupOnAbilityEnd: false });

  effects.prune((effect) => effect.ownerId === "p1" && Boolean(effect.cleanupOnAbilityEnd));

  expect(effects.active()).toHaveLength(1);
  expect(effects.active()[0].kind).toBe("ring");
});

test("visual effect queue does not mutate prior render frames", () => {
  function collectRefs(calls: readonly Renderable[], refs = new Set<object>()) {
    refs.add(calls);
    for (const call of calls) {
      if (typeof call === "function") continue;
      refs.add(call);
      const inspection = inspectRender(call);
      const nested = inspection.kind === "group" ? inspection.calls : undefined;
      if (nested) collectRefs(nested, refs);
      const commands = inspection.commands;
      if (commands) {
        refs.add(commands);
        for (const command of commands) refs.add(command);
      }
    }
    return refs;
  }

  const effects = createVisualEffectQueue();
  effects.push({ kind: "swipe", x: 10, y: 20, color: "#f4d36b", startedMs: 1000, lifetimeMs: 420, size: 18, seed: 33 });
  const first = effects.toRenderCalls(1010);
  const firstJson = JSON.stringify(first);
  const firstRefs = collectRefs(first);

  effects.toRenderCalls(1020);
  const thirdRefs = collectRefs(effects.toRenderCalls(1030));

  expect(JSON.stringify(first)).toBe(firstJson);
  expect([...thirdRefs].some((ref) => firstRefs.has(ref))).toBe(false);
});

test("actor y sort stays stable for equal overlap", () => {
  const calls: Renderable[] = [
    { kind: "group", id: "first", y: 100, ySort: 100, calls: [] },
    { kind: "group", id: "front", y: 80, ySort: 80, calls: [] },
    { kind: "group", id: "second", y: 100, ySort: 100, calls: [] }
  ];

  expect(sortRenderCallsByY(calls).map((call) => typeof call === "function" ? "" : call.id)).toEqual(["front", "first", "second"]);
});

test("compact UI state starts closed and opens one panel at a time", () => {
  const panels = createCompactPanelState();

  expect(panels.activePanel).toBe("");
  expect(panels.panelIds()).toEqual([]);
  expect(panels.toggle("bag")).toBe("bag");
  expect(panels.panelIds()).toEqual(["bag"]);
  expect(panels.toggle("stats")).toBe("stats");
  expect(panels.panelIds()).toEqual(["stats"]);
  expect(panels.toggle("journal")).toBe("journal");
  expect(panels.panelIds()).toEqual(["journal"]);
  expect(panels.toggle("catalog")).toBe("catalog");
  expect(panels.panelIds()).toEqual(["catalog"]);
  expect(panels.toggle("catalog")).toBe("");
  expect(panels.panelIds()).toEqual([]);
});

test("map resource filter toggles gatherable layer state", () => {
  const filters = createDefaultMapFilterState();

  expect(filters.gatherables).toBe(true);
  expect(mapFilterSignature(filters)).toBe("gatherables:1");
  expect(toggleMapFilter(filters, "gatherables")).toBe(false);
  expect(mapFilterSignature(filters)).toBe("gatherables:0");
  expect(toggleMapFilter(filters, "gatherables")).toBe(true);
});

test("map node tooltip summarizes gatherable vital info", () => {
  const spec = worldGatherableNodeSpecs.find((node) => node.materialName === "Twilight Sky-Oats")!;
  const tooltip = mapNodeTooltipInfoForResource(spec);

  expect(tooltip.title).toBe("Twilight Sky-Oats");
  expect(tooltip.lines).toContain("Crop Harvesting | Tier 4");
  expect(tooltip.lines).toContain("Req Lv 60 | 16.0s collect");
});

test("slot cooldown view never falls back to legacy global cooldown", () => {
  const p = player({ action: "lmb", cooldownMs: 4300, cooldowns: { Space: 4300 } });

  expect(slotCooldownMs(p, "LMB")).toBe(0);
  expect(slotCooldownMs(p, "Space")).toBe(4300);
});

test("hud skill tooltip uses keybind cooldown and optional detail lines", () => {
  const p = player({ abilitySlots: { LMB: "unlocked", "mace-pummel": "LMB" } });
  const tooltip = abilityTooltip(p, "LMB", "mace-pummel");

  expect(tooltip.header).toBe("[LMB] Pummel | ready");
  expect(tooltip.description).toContain("hold-to-charge");
  expect(tooltip.details.some((line) => line.startsWith("Charge 0-2.4s"))).toBe(true);
  expect(tooltip.details.some((line) => line.includes("cone 55-112"))).toBe(true);

  const calls = createHudRenderCalls(state(), p, { connected: true }, 960, 540, 1000, undefined, undefined, { x: 305, y: 500 });
  const texts = calls.filter((call): call is Extract<Renderable, { kind: "text"; text: string }> => typeof call !== "function" && call.kind === "text").map((call) => call.text);
  expect(texts).toContain("[LMB] Pummel | ready");
});

test("aim reticle can render dimmed for controller mode", () => {
  const calls = createAimReticleRenderCalls(undefined, { x: 120, y: 140 }, [], undefined, { alpha: 0.28 });
  const group = calls.find((call): call is Extract<Renderable, { kind: "group"; alpha?: number }> => typeof call !== "function" && call.kind === "group");

  expect(group?.id).toBe("aim-reticle");
  expect(group?.alpha).toBe(0.28);
});

test("hud render tolerates missing replicated owner maps", () => {
  const sparse = player();
  for (const key of ["inventory", "bank", "equipment", "abilitySlots", "questFlags"]) Reflect.set(sparse, key, undefined);
  const master = npc({ kind: "master-kael", role: "trainer" });

  expect(() => createHudRenderCalls(state(), sparse, { connected: true }, 960, 540, 1000, undefined)).not.toThrow();
  expect(() => createNpcRenderCalls(master, {}, sparse, 1000)).not.toThrow();
});

test("combat text transient effects fade and expire", () => {
  const hazard: HazardEntity = {
    id: "damage-text",
    entityType: "hazard",
    kind: "aoe",
    zoneId: "ashwood",
    ownerId: "",
    x: 100,
    y: 100,
    toX: 100,
    toY: 100,
    radius: 26,
    windupMs: 0,
    lifetimeMs: 720,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "damage",
    text: "-9",
    pulse: 1
  };

  const earlyCall = createHazardRenderCalls(hazard, { ageMs: 120, windupMs: 0, lifetimeMs: 720 })[0];
  if (!earlyCall) throw new Error("Expected an early hazard render group");
  const early = inspectRender(earlyCall);
  const earlyCalls = inspectRenderCalls(earlyCall);
  const ended = createHazardRenderCalls(hazard, { ageMs: 720, windupMs: 0, lifetimeMs: 720 });

  expect(early.alpha).toBeGreaterThan(0);
  expect(earlyCalls.some((call) => call.kind === "text" && call.text === "-9" && (call.alpha ?? 0) > 0)).toBe(true);
  expect(ended).toHaveLength(0);
});

test("player ability hazard animation is driven by client render timing", () => {
  const hazard: HazardEntity = {
    id: "wave-1",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "p1",
    x: 100,
    y: 100,
    toX: 200,
    toY: 100,
    radius: 100,
    windupMs: 0,
    lifetimeMs: 1,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "conewave",
    text: "",
    pulse: 60
  };
  const earlyCall = createHazardRenderCalls(hazard, { ageMs: 0, windupMs: 0, lifetimeMs: 360 })[0];
  const midCall = createHazardRenderCalls(hazard, { ageMs: 180, windupMs: 0, lifetimeMs: 360 })[0];
  if (!earlyCall || !midCall) throw new Error("Expected animated hazard render groups");
  const early = inspectRenderCalls(earlyCall);
  const mid = inspectRenderCalls(midCall);
  const ended = createHazardRenderCalls(hazard, { ageMs: 360, windupMs: 0, lifetimeMs: 360 });
  const earlyRadius = Math.max(...early.flatMap((call) => call.commands?.map((command) => Number(Reflect.get(command, "radius")) || 0) ?? [0]));
  const midRadius = Math.max(...mid.flatMap((call) => call.commands?.map((command) => Number(Reflect.get(command, "radius")) || 0) ?? [0]));
  const widest = Math.max(...mid.map((call) => call.lineWidth ?? 0));

  expect(earlyRadius).toBeGreaterThan(65);
  expect(midRadius).toBeGreaterThan(50);
  expect(widest).toBeLessThan(3);
  expect(mid.some((call) => call.lineDash?.length)).toBe(true);
  expect(ended).toHaveLength(0);
});

test("semantic melee waves avoid thick capsule fallback", () => {
  const hazard: HazardEntity = {
    id: "toxic-wave",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "p1",
    x: 100,
    y: 100,
    toX: 220,
    toY: 100,
    radius: 260,
    windupMs: 0,
    lifetimeMs: 300,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "toxicwave",
    text: "",
    pulse: 50
  };
  const groupCall = createHazardRenderCalls(hazard, { ageMs: 90, windupMs: 0, lifetimeMs: 300 })[0];
  if (!groupCall) throw new Error("Expected a melee hazard render group");
  const group = inspectRenderCalls(groupCall);
  const wideLines = group.filter((call) => call.kind === "line" && (call.lineWidth ?? 0) > 6);
  const dashedLines = group.filter((call) => call.kind === "line" && call.lineDash?.length);

  expect(wideLines).toHaveLength(0);
  expect(dashedLines.length).toBeGreaterThanOrEqual(2);
  expect(group.some((call) => call.kind === "polygon" && typeof call.fill === "object")).toBe(true);
});

test("transient projectile traces reveal a themed tail behind the body", () => {
  const hazard: HazardEntity = {
    id: "chaos-trace",
    entityType: "hazard",
    kind: "line",
    zoneId: "ashwood",
    ownerId: "",
    x: 100,
    y: 100,
    toX: 190,
    toY: 100,
    radius: 6,
    windupMs: 0,
    lifetimeMs: 320,
    damage: 0,
    knockbackModifier: 0,
    isHeavyImpact: false,
    armorPierce: false,
    effectKind: "chaos",
    text: "",
    pulse: 0
  };
  const groupCall = createHazardRenderCalls(hazard, { ageMs: 40, windupMs: 0, lifetimeMs: 320 })[0];
  if (!groupCall) throw new Error("Expected a projectile trace render group");
  const group = inspectRenderCalls(groupCall);
  const travelLine = group.find((call) => call.kind === "line" && call.stroke === "rgba(255,98,180,0.24)");

  expect(travelLine).toBeDefined();
  if (!travelLine || travelLine.x1 === undefined || travelLine.x2 === undefined || travelLine.lineWidth === undefined) throw new Error("Expected a complete projectile trace line");
  expect(travelLine.x2).toBeGreaterThan(travelLine.x1);
  expect(travelLine.x2).toBeLessThan(190);
  expect(travelLine.lineWidth).toBeLessThan(8);
  expect(group.some((call) => call.kind === "line" && call.x1 === 100 && call.x2 === 190)).toBe(false);
});

test("replicated transient effects advance on client frame time between server ticks", () => {
  const cache = new Map();
  const effect = { id: "hex-echo", ageMs: 80, lifetimeMs: 360 };
  const first = clientTransientEffectTiming(effect, 1000, cache);
  const next = clientTransientEffectTiming(effect, 1016, cache);

  expect(first.ageMs).toBe(80);
  expect(next.ageMs).toBe(96);
});
