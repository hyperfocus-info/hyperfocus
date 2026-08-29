import { expect, test } from "bun:test";
import { updateDialogState, createHudRenderCalls } from "../client/render/hud.ts";
import { landmarkInteractionInfo } from "../client/render/interactions.ts";
import { createNpcRenderCalls, npcJobCue, questMarkerFor } from "../client/render/npcs.ts";
import { abilityCastSfx, abilityImpactSfx, abilityProjectileSfx, npcAttackSfx } from "../client/render/signals.ts";
import { createPlayerRenderCalls } from "../client/render/players.ts";
import { createMainQuestGuideRenderCalls } from "../client/render/quests.ts";
import { createResourceRenderCalls } from "../client/render/resources.ts";
import { mainQuestDestination } from "../client/quest-guide.ts";
import { NPC_SIZE_BY_KIND } from "../data/entity-sizes.ts";
import { worldLandmarkId, worldLandmarkPlacements } from "../data/world-landmarks.ts";
import { type ResourceEntity } from "../shared-contracts.ts";
import { fakeImage, flattenRenderCalls, inspectRenderCalls, npc, player, renderPointAxis, state } from "./render-test-fixtures.ts";


test("player mobility abilities render ghosts ribbons and readable labels", () => {
  const images = { hero: fakeImage(176, 44) };
  const cache = new Map([["p1", { x: 100, y: 120, ability: "wand-blink", activeMs: 20, activeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ x: 168, y: 120, equipment: { weapon: "wand" }, equippedWeaponId: "wand", activeAbility: "", activeSlot: "Space", abilitySlots: { Space: "unlocked", "wand-blink": "Space" }, iframeMs: 120 }),
    images,
    1120,
    player(),
    "p1",
    cache
  );
  const calls = inspectRenderCalls(group);
  const lastMotion = calls.reduce((last, call, index) => call.id?.includes("movement-afterimage") || call.id?.includes("motion-ribbon") ? index : last, -1);
  const label = calls.findIndex((call) => call.kind === "text" && call.text === "Tester");

  expect(calls.some((call) => call.id?.includes("movement-afterimage"))).toBe(true);
  expect(calls.some((call) => call.id?.includes("motion-ribbon"))).toBe(true);
  expect(calls.some((call) => call.id?.includes("body-accent"))).toBe(true);
  expect(label).toBeGreaterThan(lastMotion);
});

test("player render tracks facing and flips the stopgap sprite", () => {
  const images = { hero: fakeImage(176, 44) };
  const rightCache = new Map([["p1", { x: 100, y: 120, facingX: 0, facingY: 1 }]]);
  const [rightGroup] = createPlayerRenderCalls(player({ x: 128, y: 120, activeAbility: "", activeSlot: "" }), images, 1000, player(), "p1", rightCache);
  const rightCalls = inspectRenderCalls(rightGroup);
  const rightSprite = rightCalls.find((call) => call.kind === "sprite");
  const rightCue = rightCalls.find((call) => call.id === "player-facing-chevron");

  expect(rightSprite?.flipX).toBe(false);
  expect((rightCache.get("p1")?.facingX ?? 0)).toBeGreaterThan(0.9);
  expect(renderPointAxis(rightCue?.points, 0, "x") ?? 0).toBeGreaterThan(renderPointAxis(rightCue?.points, 1, "x") ?? 0);

  const leftCache = new Map([["p1", { x: 128, y: 120, facingX: 1, facingY: 0 }]]);
  const [leftGroup] = createPlayerRenderCalls(player({ x: 100, y: 120, activeAbility: "", activeSlot: "" }), images, 1000, player(), "p1", leftCache);
  const leftCalls = inspectRenderCalls(leftGroup);
  const leftSprite = leftCalls.find((call) => call.kind === "sprite");
  const leftCue = leftCalls.find((call) => call.id === "player-facing-chevron");

  expect(leftSprite?.flipX).toBe(true);
  expect((leftCache.get("p1")?.facingX ?? 0)).toBeLessThan(-0.9);
  expect(renderPointAxis(leftCue?.points, 0, "x") ?? 0).toBeLessThan(renderPointAxis(leftCue?.points, 1, "x") ?? 0);
});

test("player charge renders weapon themed swirls", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 1200, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRenderCalls(group);

  expect(calls.filter((call) => call.id?.startsWith("charge-swirl")).length).toBe(3);
  expect(calls.some((call) => call.id === "charge-ring")).toBe(true);
  expect(calls.some((call) => call.id === "pummel-hit-indicator-fill")).toBe(true);
  expect(calls.some((call) => call.id === "pummel-hit-indicator-edge")).toBe(true);
});

test("player facing triangle follows live aim after attacks", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", action: "lmb", aimX: 100, aimY: 40, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRenderCalls(group);
  const cue = calls.find((call) => call.id === "player-facing-chevron");

  expect(renderPointAxis(cue?.points, 0, "y") ?? 999).toBeLessThan(renderPointAxis(cue?.points, 1, "y") ?? 0);
});

test("player charged actions lean without violent sprite shake", () => {
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 1200, castMs: 180, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1400,
    player(),
    "p1",
    new Map()
  );
  const calls = inspectRenderCalls(group);
  const sprite = calls.find((call) => call.kind === "sprite");

  expect(Math.abs((sprite?.x ?? 0) - 100)).toBeLessThan(1);
  expect(sprite?.anchor).toBe("top");
  expect(calls.some((call) => call.id === "player-facing-chevron")).toBe(true);
  expect(calls.some((call) => call.id === "player-facing-weapon")).toBe(false);
});

test("player charge visuals stop when charged ability is no longer active", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 900, activeSeenMs: 1000, chargeMs: 1400, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "", activeSlot: "", chargeMs: 1400 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRenderCalls(group);

  expect(calls.some((call) => call.id === "charge-ring")).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("charge-swirl"))).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("pummel-hit-indicator"))).toBe(false);
  expect(cache.get("p1")?.chargeMs).toBe(0);
});

test("zero replicated charge does not grow from cached charged state", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 900, activeSeenMs: 1000, chargeMs: 1400, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ activeAbility: "mace-pummel", activeSlot: "LMB", chargeMs: 0 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRenderCalls(group);

  expect(calls.some((call) => call.id === "charge-ring")).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("charge-swirl"))).toBe(false);
  expect(calls.some((call) => call.id?.startsWith("pummel-hit-indicator"))).toBe(false);
});

test("pummel hit indicator grows on client frame time", () => {
  const cache = new Map([["p1", { x: 100, y: 120, ability: "mace-pummel", activeMs: 300, activeSeenMs: 1000, chargeMs: 300, chargeSeenMs: 1000 }]]);
  const [group] = createPlayerRenderCalls(
    player({ x: 100, y: 120, activeAbility: "mace-pummel", activeSlot: "LMB", activeMs: 300, chargeMs: 300, abilityVectorX: 1, abilityVectorY: 0 }),
    { hero: fakeImage(176, 44) },
    1600,
    player(),
    "p1",
    cache
  );
  const calls = inspectRenderCalls(group);
  const edge = calls.find((call) => call.id === "pummel-hit-indicator-edge");

  expect(Number(Reflect.get(edge?.commands?.[0] ?? {}, "radius"))).toBeGreaterThan(68);
});

test("quest markers use available active ready visual language", () => {
  const elder = npc({ kind: "elder-rowan", role: "quest" });
  const board = npc({ kind: "contract-board", role: "contract" });
  const vael = npc({ kind: "high-arcanist-vael", role: "quest" });

  expect(questMarkerFor(elder, player({ activeQuestId: "" }))).toMatchObject({ glyph: "?", fill: "#f4d36b" });
  expect(questMarkerFor(elder, player({ activeQuestId: "first-cut" }))).toMatchObject({ glyph: "!", fill: "#687173" });
  expect(questMarkerFor(elder, player({ activeQuestId: "first-cut", questFlags: { "first-cut-ready": true } }))).toMatchObject({ glyph: "!", fill: "#f4d36b" });
  expect(questMarkerFor(elder, player({ questFlags: { "first-cut": true, "second-cut": true, "wolf-culling": true, "final-cut": true } }))).toBeUndefined();
  expect(questMarkerFor(board, player({ contractKills: 12 }))).toMatchObject({ glyph: "!", fill: "#f4d36b" });
  expect(questMarkerFor(board, player({ contractCooldownMs: 12000 }))).toBeUndefined();
  expect(questMarkerFor(vael, player({ activeQuestId: "forbidden-scripts", questFlags: { "forbidden-scripts-accepted": true } }))).toMatchObject({ glyph: "!", fill: "#687173" });
});

test("main quest guide renders shiny trail and area border", () => {
  const calls = createMainQuestGuideRenderCalls(state(), player({ x: 100, y: 120, activeQuestId: "first-cut" }), 1000);
  const flat = flattenRenderCalls(calls);

  expect(flat.some((call) => call.kind === "line" && call.stroke === "rgba(199, 255, 168, 0.07)")).toBe(true);
  expect(flat.some((call) => call.kind === "circle" && call.stroke === "rgba(255, 255, 255, 0.66)" && call.dash)).toBe(true);
  expect(flat.some((call) => call.kind === "circle" && call.fill === "rgba(255, 255, 255, 0.58)" && (call.shadowBlur ?? 0) > 0)).toBe(true);
});

test("main quest destination prefers closest live required source", () => {
  const nearTree: ResourceEntity = { id: "near-tree", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const farTree: ResourceEntity = { ...nearTree, id: "far-tree", x: 500, y: 120 };
  const cragsTree: ResourceEntity = { ...nearTree, id: "crags-tree", zoneId: "crags", x: 120, y: 120 };
  const firstCut = mainQuestDestination(state({ resources: { [nearTree.id]: nearTree, [farTree.id]: farTree, [cragsTree.id]: cragsTree } }), player({ x: 100, y: 120, activeQuestId: "first-cut" }));
  expect(firstCut).toMatchObject({ kind: "point", x: nearTree.x, y: nearTree.y, label: "Cut Ash Tree" });

  const nearWolf = npc({ id: "near-wolf", kind: "prowling-wolf", x: 210, y: 120 });
  const farWolf = npc({ id: "far-wolf", kind: "prowling-wolf", x: 900, y: 120 });
  const cragsWolf = npc({ id: "crags-wolf", kind: "prowling-wolf", zoneId: "crags", x: 120, y: 120 });
  const wolfQuest = mainQuestDestination(state({ npcs: { [nearWolf.id]: nearWolf, [farWolf.id]: farWolf, [cragsWolf.id]: cragsWolf } }), player({ x: 100, y: 120, activeQuestId: "wolf-culling", questFlags: { "second-cut": true } }));
  expect(wolfQuest).toMatchObject({ kind: "point", x: nearWolf.x, y: nearWolf.y, label: "Cull Wolf" });

  const rowan = npc({ id: "rowan", kind: "elder-rowan", role: "quest", zoneId: "ashwood", x: 300, y: 120 });
  const captain = npc({ id: "captain", kind: "captain-marrow", role: "travel", zoneId: "port-marrow", x: 900, y: 120 });
  const finalCut = mainQuestDestination(state({ npcs: { [rowan.id]: rowan, [captain.id]: captain } }), player({ activeQuestId: "final-cut", questFlags: { "wolf-culling": true } }));
  expect(finalCut).toMatchObject({ kind: "point", x: rowan.x, y: rowan.y, label: "Final Cut" });
  const route = mainQuestDestination(state({ npcs: { [rowan.id]: rowan, [captain.id]: captain } }), player({ activeQuestId: "lost-compass", questFlags: { "final-cut": true, "lost-compass-accepted": true } }));
  expect(route).toMatchObject({ kind: "point", x: captain.x, y: captain.y, label: "Lost Compass" });
});

test("first proof resource and HUD readbacks stay compact", () => {
  const tree: ResourceEntity = { id: "first-proof-tree", entityType: "resource", kind: "tree", skillId: "lumberjacking", zoneId: "ashwood", x: 180, y: 120, hp: 2, maxHp: 2, depleted: false, respawnMs: 0 };
  const resourceCalls = flattenRenderCalls(createResourceRenderCalls(tree, {}, undefined, [], undefined, true));
  expect(resourceCalls.some((call) => call.kind === "text" && call.text === "FIRST PROOF")).toBe(true);
  expect(resourceCalls.some((call) => call.kind === "circle" && call.stroke === "rgba(244, 211, 107, 0.88)")).toBe(true);

  const freshHud = flattenRenderCalls(createHudRenderCalls(state(), player({ activeQuestId: "first-cut" }), {}, 1024, 720, 1000, undefined));
  expect(freshHud.some((call) => call.text === "Cut glowing Ash tree 0/5")).toBe(true);
  expect(freshHud.some((call) => call.text === "First Cut")).toBe(true);

  const proofHud = flattenRenderCalls(createHudRenderCalls(state(), player({ activeQuestId: "first-cut", inventory: { "ash-logs": 1 } }), {}, 1024, 720, 1000, undefined));
  expect(proofHud.some((call) => call.text === "Proof marked: clean cut. Cut glowing Ash tree 1/5")).toBe(true);
  expect(proofHud.some((call) => call.text === "Return")).toBe(true);
});

test("support NPC dialog keeps in-world voice without meta labels", () => {
  const rowan = npc({ id: "rowan", kind: "elder-rowan", role: "quest" });
  const rowanDialog = updateDialogState(state({ npcs: { [rowan.id]: rowan } }), player({ targetId: rowan.id, action: "interact" }), 1000);
  expect(rowanDialog?.body).toContain("First Cut: 0/5");
  expect(rowanDialog?.body).not.toContain("Mood:");
  expect(rowanDialog?.body).not.toContain("hero talk");

  const clerk = npc({ id: "route-clerk", kind: "route-clerk", role: "quest" });
  const fallbackDialog = updateDialogState(state({ npcs: { [clerk.id]: clerk } }), player({ targetId: clerk.id, action: "interact" }), 1000);
  expect(fallbackDialog?.body).toContain("has no posted work");
  expect(fallbackDialog?.body).not.toContain("watches your progress");
});

test("landmark interactables read like posted world objects", () => {
  const safeRoadSign = worldLandmarkPlacements.find((placement) => placement.service === "safe-road warning post")!;
  const safeRoadInfo = landmarkInteractionInfo(worldLandmarkId(safeRoadSign));
  expect(safeRoadInfo?.body).toContain("patrol ends here");
  expect(safeRoadInfo?.body).toContain("Painted mark: T.");

  const foragerHut = worldLandmarkPlacements.find((placement) => placement.service === "rootway forager hut")!;
  expect(landmarkInteractionInfo(worldLandmarkId(foragerHut))?.body).toContain("rest point, not a safe house");

  const marketWell = worldLandmarkPlacements.find((placement) => placement.service === "packed market well")!;
  expect(landmarkInteractionInfo(worldLandmarkId(marketWell))?.body).toContain("Rope burns");

  const wolfCamp = worldLandmarkPlacements.find((placement) => placement.service === "wolf den camp")!;
  const wolfCampBody = landmarkInteractionInfo(worldLandmarkId(wolfCamp))?.body ?? "";
  expect(wolfCampBody).toContain("fresh tracks");
  expect(wolfCampBody).not.toContain("points toward the nearest route");
  expect(wolfCampBody).not.toContain("is a civic landmark");
  expect(wolfCampBody).not.toContain("marks usable local material");
});

test("support NPC job cues use distinct badge identities", () => {
  const supportKinds = [
    "elder-rowan",
    "blacksmith-silas",
    "blacksmith",
    "miller-finn",
    "scout-elara",
    "foreman-iron-will",
    "overseer-bale",
    "geologist-mira",
    "runner-kael",
    "navigator-kai",
    "captain-marrow",
    "high-arcanist-vael",
    "alchemist-zora",
    "banker-valerius",
    "merchant-kaya",
    "apprentice-jinn",
    "innkeeper-martha",
    "contract-board",
    "master-kael",
    "cursed-statue"
  ];
  const signatures = new Set<string>();

  for (const kind of supportKinds) {
    const cue = npcJobCue({ kind });
    expect(cue, kind).toBeDefined();
    expect(cue?.icon, kind).toBeTruthy();
    signatures.add(`${cue?.shape ?? "circle"}:${cue?.fill}:${cue?.icon}:${cue?.glyph}:${cue?.accent ?? ""}`);
  }

  expect(signatures.size).toBe(supportKinds.length);
});

test("support NPCs render planted service fixtures", () => {
  const images = {
    worldPortBuildingLarge: fakeImage(224, 96),
    worldGuildInteriorObjects: fakeImage(384, 384)
  };
  const [merchantGroup] = createNpcRenderCalls(npc({ kind: "merchant-kaya", role: "merchant", zoneId: "port-marrow", spawnX: 140, spawnY: 160 }), images, player(), 1000);
  const [smithGroup] = createNpcRenderCalls(npc({ kind: "blacksmith-silas", role: "crafting", zoneId: "crags", spawnX: 180, spawnY: 190 }), images, player(), 1000);
  if (!merchantGroup || !smithGroup) throw new Error("Expected support NPC render groups.");
  const merchantCalls = flattenRenderCalls([merchantGroup]);
  const smithCalls = flattenRenderCalls([smithGroup]);

  expect(merchantCalls.some((call) => call.kind === "sprite" && call.image === images.worldPortBuildingLarge)).toBe(true);
  expect(merchantCalls.some((call) => call.kind === "text" && call.text === "$")).toBe(true);
  expect(smithCalls.some((call) => call.kind === "sprite" && call.image === images.worldGuildInteriorObjects)).toBe(true);
  expect(smithCalls.some((call) => call.kind === "text" && call.text === "F")).toBe(true);
});

test("enemy debuffs render compact badge readbacks", () => {
  const [group] = createNpcRenderCalls(
    npc({ combatFlags: "hex:2|weakened|antiheal", slowMs: 1200 }),
    {},
    player(),
    1000
  );
  const calls = inspectRenderCalls(group);

  expect(calls.some((call) => call.kind === "text" && call.text === "H2")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "W")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "X")).toBe(true);
  expect(calls.some((call) => call.kind === "text" && call.text === "S")).toBe(true);
});

test("NPCs fall back to body shape when selected sprite is not drawable", () => {
  const [group] = createNpcRenderCalls(
    npc({ kind: "prowling-wolf" }),
    { enemyGoblin: fakeImage(0, 0) },
    player(),
    1000
  );
  const calls = inspectRenderCalls(group);

  expect(calls.some((call) => call.kind === "sprite" || call.image)).toBe(false);
  expect(calls.some((call) => call.kind === "circle" && call.radius === NPC_SIZE_BY_KIND["prowling-wolf"]!.radius)).toBe(true);
});

test("NPC attack SFX route by impact identity", () => {
  expect(npcAttackSfx({ impactType: "void", role: "mob" }, true)).toBe("npc-void");
  expect(npcAttackSfx({ impactType: "spark", role: "mob" }, true)).toBe("npc-spark");
  expect(npcAttackSfx({ impactType: "sap", role: "mob" }, false)).toBe("npc-sap");
  expect(npcAttackSfx({ impactType: "blood", role: "mob" }, false)).toBe("npc-claw");
  expect(npcAttackSfx({ impactType: "blood", role: "boss" }, false)).toBe("npc-cast");
});

test("player ability SFX route by weapon family and phase", () => {
  expect(abilityCastSfx("mace-pummel")).toBe("mace-cast");
  expect(abilityCastSfx("space-rush")).toBe("mace-cast");
  expect(abilityCastSfx("bow-quick-shot")).toBe("bow-cast");
  expect(abilityCastSfx("staff-meteor")).toBe("staff-cast");
  expect(abilityCastSfx("wand-hex")).toBe("wand-cast");
  expect(abilityCastSfx("twin-toxic-slash")).toBe("twin-cast");
  expect(abilityCastSfx("blade-cleave")).toBe("blade-cast");
  expect(abilityProjectileSfx("boulder")).toBe("mace-projectile");
  expect(abilityProjectileSfx("arrow")).toBe("bow-projectile");
  expect(abilityProjectileSfx("arcane-bolt")).toBe("staff-projectile");
  expect(abilityProjectileSfx("missile")).toBe("wand-projectile");
  expect(abilityProjectileSfx("dirk")).toBe("twin-projectile");
  expect(abilityProjectileSfx("razor")).toBe("blade-projectile");
  expect(abilityImpactSfx("blade-brutal-strike")).toBe("blade-impact");
});
