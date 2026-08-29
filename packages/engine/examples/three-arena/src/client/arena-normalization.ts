import { ARENA_DATA } from "../arena-data.ts";
import { ENEMY_HEALTH_BASE_MULTIPLIER, FALLBACK_DATA, HEALTH_VIAL_DROP_MULTIPLIER, MAGNET_DROP_CHANCE, MAP_LINEAR_MULTIPLIER, STATIC_VISIBILITY_RADIUS } from "./constants.ts";
import type { ArenaData, ArenaPropDefinition, EnemyDefinition, RawEnemyDefinition, RawHazardDefinition, RawWaveDefinition, RawWeaponDefinition, WaveDefinition, WeaponDefinition } from "./content-types.ts";
import { terrainSeed } from "./terrain-math.ts";

export function normalizeArenaData(raw: typeof ARENA_DATA): ArenaData {
  const balancePlayer = raw.balance.player;
  const balanceDirector = raw.balance.director;
  const balanceArena = raw.balance.arena;
  const balanceProgression = raw.balance.progression;
  const baseRadius = Math.max(36, Math.min(70, (balanceArena.floorSize ?? 96) / 2));
  const radius = baseRadius * MAP_LINEAR_MULTIPLIER;
  const rawWeapons: Record<string, RawWeaponDefinition> = raw.weapons;
  const weapons: WeaponDefinition[] = Object.values(rawWeapons).map((weapon, index) => {
    const base = weapon.base ?? {};
    const speed = base.projectileSpeed ?? 22;
    const projectileCount = base.projectiles ?? base.arcs ?? base.pulseCount ?? base.orbitals ?? base.summons ?? 1;
    return {
      id: weapon.id,
      name: weapon.name,
      label: (weapon.name ?? weapon.id).slice(0, 2).toUpperCase(),
      fantasy: weapon.fantasy ?? "",
      tierBadge: weapon.tierBadge ?? "Weapon",
      stateLabel: weapon.stateLabel ?? "Attack",
      tags: weapon.tags ?? [],
      categories: weapon.categories ?? {},
      maxLevel: weapon.maxLevel ?? 1,
      levels: weapon.levels ?? [],
      evolution: weapon.evolution ?? null,
      damageType: base.damageType ?? weapon.tags?.find((tag) => ["physical", "silver", "fire", "shadow", "holy", "plague", "bleed"].includes(tag)) ?? "physical",
      cooldown: base.cooldown ?? 0.6,
      damage: base.damage ?? 12,
      speed,
      range: Math.max(9, (base.lifetime ?? 1.1) * speed),
      pellets: projectileCount,
      spread: ((base.spreadDegrees ?? (index % 2 ? 8 : 2)) * Math.PI) / 180,
      pierce: Math.min(8, base.pierce ?? 1),
      knockback: base.knockback ?? resolveWeaponKnockback(weapon.id, base.cooldown ?? 0.6, base.damage ?? 12, projectileCount),
      color: weapon.visual?.color ?? ["#ffd782", "#ff9d4a", "#cfd7df", "#74c96b", "#6b4a35", "#bda9ff"][index % 6]
    };
  });
  const enemies: Record<string, EnemyDefinition> = {};
  const rawEnemies: Record<string, RawEnemyDefinition> = raw.enemies;
  for (const [id, enemy] of Object.entries(rawEnemies)) {
    const texture = id.includes("Runner") || id.includes("runner") || id.includes("hound")
      ? "zombieB"
      : id.includes("brute") || id.includes("Bloat") || id.includes("bloat") || id.includes("guard")
        ? "brute"
        : id.includes("shade") || id.includes("witch") || id.includes("lich")
          ? "shade"
          : "zombieA";
    enemies[id] = {
      name: enemy.name ?? id,
      hp: (enemy.health ?? 28) * ENEMY_HEALTH_BASE_MULTIPLIER,
      speed: (enemy.speed ?? 2.5) * 1.45,
      touch: enemy.contactDamage ?? 10,
      radius: Math.max(0.75, (enemy.radius ?? 0.6) * 1.45),
      score: enemy.xp ?? 2,
      texture
    };
  }
  const rawWaves: RawWaveDefinition[] = raw.waves;
  const waves: WaveDefinition[] = rawWaves.map((wave, index) => ({
    id: wave.id ?? `wave-${index + 1}`,
    at: wave.startSecond ?? index * 45,
    name: wave.label ?? wave.id ?? `Wave ${index + 1}`,
    mix: (wave.squads ?? [{ enemyId: Object.keys(enemies)[0], weight: 1 }]).map((squad) => [squad.enemyId, squad.weight ?? 1]),
    rate: wave.spawnIntervalSeconds ?? Math.max(0.35, 1.1 - index * 0.08),
    cap: Math.min(130, wave.spawnCap ?? 35 + index * 14),
    eliteId: wave.eliteId ?? null,
    bossAtSecond: wave.bossAtSecond
  }));
  const rawHazards: Record<string, RawHazardDefinition> = raw.hazards;
  const hazardDefs = Object.values(rawHazards);
  const hazardPositions = [[-18, -12], [22, 11], [-5, 24], [27, -20], [-25, 18]];
  const hazards = hazardDefs.slice(0, 5).map((hazard, index) => ({
    id: hazard.id,
    kind: hazard.id,
    x: hazardPositions[index][0],
    z: hazardPositions[index][1],
    radius: hazard.radius ?? 4,
    dps: hazard.damagePerSecond ?? Math.max(5, (hazard.damage ?? 20) / 4)
  }));
  return {
    balance: raw.balance,
    arena: { radius, softRadius: radius, spawnRadius: Math.min(radius * 0.46, 48), worldSize: radius * 2, baseRadius },
    player: {
      startHealth: balancePlayer.startHealth ?? 120,
      healthRegenPerSecond: balancePlayer.healthRegenPerSecond ?? 0,
      moveSpeed: Math.max(8.8, (balancePlayer.moveSpeed ?? 6.2) * 1.74),
      pickupRadius: balancePlayer.pickupRadius ?? 2.4,
      maxWeaponSlots: balancePlayer.maxWeaponSlots ?? 6,
      maxPassiveSlots: balancePlayer.maxPassiveSlots ?? 6
    },
    progression: {
      startLevel: balanceProgression.startLevel ?? 1,
      xpCurveBase: balanceProgression.xpCurveBase ?? 24,
      xpCurvePower: balanceProgression.xpCurvePower ?? 1.28,
      xpCurveLinear: balanceProgression.xpCurveLinear ?? 8,
      levelChoiceCount: balanceProgression.levelChoiceCount ?? 3,
        rerollsStart: balanceProgression.rerollsStart ?? 0,
        banishesStart: balanceProgression.banishesStart ?? 0,
      evolutionLevel: balanceProgression.evolutionLevel ?? 8,
      passiveEvolutionLevel: balanceProgression.passiveEvolutionLevel ?? 5
    },
    passiveItems: Object.values(raw.passiveItems),
    playerClasses: Object.values(raw.playerClasses),
    levelUpPools: raw.levelUpPools,
    pickups: raw.pickups,
    weapons,
    enemies,
    waves,
    hazards,
    props: expandArenaProps(FALLBACK_DATA.props, radius),
    objectives: raw.objectives,
    pickupChances: {
      heal: (balanceDirector.healingDropChance ?? 0.035) * HEALTH_VIAL_DROP_MULTIPLIER,
      magnet: MAGNET_DROP_CHANCE
    }
  };
}

export function resolveWeaponKnockback(id: string, cooldown: number, damage: number, pellets: number): number {
  const cadence = cooldown < 0.16 ? 0.42 : cooldown < 0.5 ? 0.72 : cooldown < 1 ? 1.05 : 1.34;
  const payload = Math.max(1, damage) / Math.max(1, pellets);
  let type = 1;
  if (/shotgun|coffin|hammer|lid/i.test(id)) type = 1.45;
  else if (/rifle|stake|spear|silver/i.test(id)) type = 1.7;
  else if (/flame|lantern|plague|swarm/i.test(id)) type = 0.55;
  else if (/smg|splinter|bone/i.test(id)) type = 0.78;
  return Math.max(1.1, Math.min(13.5, payload * cadence * type));
}

export function expandArenaProps(props: ArenaPropDefinition[], radius: number): ArenaPropDefinition[] {
  const axis = Math.max(3, Math.min(5, Math.ceil((radius * 2) / (STATIC_VISIBILITY_RADIUS * 1.45))));
  const spacing = (radius * 2) / axis;
  const expanded: ArenaPropDefinition[] = [];
  let clusterIndex = 0;
  for (let ix = 0; ix < axis; ix += 1) {
    for (let iz = 0; iz < axis; iz += 1) {
      const clusterX = -radius + spacing * (ix + 0.5);
      const clusterZ = -radius + spacing * (iz + 0.5);
      const clusterJitterX = (terrainSeed(ix, iz, 5) - 0.5) * spacing * 0.22;
      const clusterJitterZ = (terrainSeed(ix, iz, 6) - 0.5) * spacing * 0.22;
      for (const prop of props) {
        const skip = clusterIndex !== Math.floor(axis * axis / 2) && terrainSeed(clusterIndex, Math.round(prop.x * 7 + prop.z * 5), 7) < 0.08;
        if (skip) continue;
        const scaleJitter = clusterIndex === Math.floor(axis * axis / 2) ? 1 : 0.88 + ((clusterIndex * 17 + Math.round(prop.x * 3)) % 9) * 0.035;
        const localSpread = 0.9 + terrainSeed(clusterIndex, expanded.length, 8) * 0.22;
        expanded.push({
          ...prop,
          id: `${prop.model}-${clusterIndex}-${expanded.length}`,
          x: wrapValue(clusterX + clusterJitterX + prop.x * localSpread, radius * 2),
          z: wrapValue(clusterZ + clusterJitterZ + prop.z * localSpread, radius * 2),
          rot: (prop.rot ?? 0) + clusterIndex * 0.17,
          scale: (prop.scale ?? 1) * scaleJitter
        });
      }
      clusterIndex += 1;
    }
  }
  return expanded;
}

export function wrapValue(value: number, size: number): number {
  const half = size / 2;
  return ((((value + half) % size) + size) % size) - half;
}
