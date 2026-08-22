import { mmoCatalog, playerAbilityMetadata, type PlayerEntity } from "../shared.ts";
import { energyMax, energyReady, energyValue, slotCooldownMs, type CombatSlot } from "./combat-view.ts";

type AbilityTooltipDetail = {
  damage?: string;
  duration?: string;
  ticks?: string;
  charge?: string;
  hitbox?: string;
  range?: string;
  projectileSpeed?: string;
  homing?: string;
  projectileInfo?: string;
  hitboxInfo?: string;
};

export type AbilityTooltip = {
  header: string;
  description: string;
  details: string[];
};

const SUMMARY_BY_ID = Object.fromEntries(mmoCatalog.abilities.map((ability) => [ability.id, ability.summary]));

const DETAILS: Record<string, AbilityTooltipDetail> = {
  "mace-pummel": { damage: "7 + level*2 + gear, up to 6x at full charge", charge: "0-2.4s hold; releases at full charge", hitbox: "cone 55-112 range, 50-90deg half-angle", hitboxInfo: "short lunge, heavy impact after half charge" },
  "mace-crushing-leap": { damage: "14 + level*2 + gear", duration: "travel up to 0.5s", hitbox: "aoe 72 radius at landing", range: "330", hitboxInfo: "i-frame leap, stun 1.0s, slow 3.0s" },
  "space-rush": { damage: "8 + level*1.5 + distance scaling", duration: "5.0s max", hitbox: "swept body collision", range: "movement-driven", hitboxInfo: "turning tightens as speed rises" },
  "q-berserk": { duration: "0.75s guard", hitbox: "self buff", hitboxInfo: "negates damage, heals, grants Energy" },
  "mace-rock-smash": { damage: "9-11 + level/gear per boulder", charge: "0-1.0s hold", hitbox: "projectile line 10-27 width", range: "130-220", projectileInfo: "full charge fires 10 fragments and applies recoil" },
  "mace-whirlwind": { damage: "22 + level*1.2 + gear per tick", duration: "2.75s channel", ticks: "0.25s", hitbox: "aoe 101 radius", hitboxInfo: "pulls enemies inward" },
  "bow-quick-shot": { hitbox: "projectile line 9 width", range: "350", projectileInfo: "first target only; empowered shot doubles damage" },
  "bow-precision": { hitbox: "piercing line 13 width", range: "650", projectileInfo: "pierces multiple targets; heavy knockback" },
  "bow-volley": { hitbox: "7 projectile lines in 70deg fan", range: "350", projectileInfo: "repeat hits on same target fall off" },
  "bow-reposition": { duration: "0.25s dash", hitbox: "movement dash", range: "1.40 pmsps", hitboxInfo: "i-frame dash; empowers next Quick Shots" },
  "bow-vault": { damage: "mild bow burst", duration: "0.25s backstep", hitbox: "aoe 100 radius", range: "0.85 pmsps backstep", hitboxInfo: "i-frame backstep" },
  "bow-stealth": { duration: "3.0s stealth", hitbox: "self buff", hitboxInfo: "movement speed decays during stealth" },
  "bow-decoy": { damage: "decent bow burst on explode", duration: "decoy lasts until destroyed or replaced", hitbox: "taunt aoe 250 radius; explosion 150 radius" },
  "bow-bolas": { damage: "mild bow hit; secondary hits 70%", hitbox: "projectile line 48 width", range: "350", projectileInfo: "links 150 range behind target; stun/weaken if linked" },
  "bow-caltrops": { damage: "32% mild bow damage per tick", duration: "5.2s hazard", charge: "0-1.0s hold", hitbox: "aoe trap 42-180 radius", range: "250-500" },
  "bow-flurry": { damage: "mild bow damage per arrow", duration: "channel", ticks: "0.166s, up to 30 arrows", hitbox: "projectile line 8 width", range: "450", projectileInfo: "low knockback arrow stream" },
  "bow-arrowstorm": { damage: "mild bow damage per tick", duration: "3.0s hazard", hitbox: "aoe 200 radius", range: "cursor targeted" },
  "staff-arcane-bolt": { hitbox: "line 12 width", range: "450", projectileInfo: "first target impact" },
  "staff-siphon-beam": { duration: "held tether", ticks: "0.25s", hitbox: "beam tether", range: "260", hitboxInfo: "self-heals on damage ticks" },
  "staff-meteor": { damage: "heavy spell impact", hitbox: "aoe impact", range: "450", projectileInfo: "aimed delayed strike" },
  "staff-healing-pulse": { hitbox: "ally aoe pulse", range: "450", hitboxInfo: "heals targeted ally cluster" },
  "staff-frost-chain": { damage: "spell chain hit", hitbox: "chained projectile", range: "420", projectileInfo: "bounces and slows targets" },
  "staff-astral-walk": { duration: "short blink", hitbox: "movement teleport", range: "260" },
  "staff-zephyr": { duration: "movement channel", hitbox: "self buff", hitboxInfo: "speed boost while active" },
  "staff-ice-wall": { duration: "short wall", hitbox: "line wall", range: "360", hitboxInfo: "blocks hostile projectiles and slows crossings" },
  "staff-arcane-bubble": { duration: "short active window", hitbox: "self dome", hitboxInfo: "reduces incoming damage" },
  "staff-petrify": { hitbox: "line control", range: "420", hitboxInfo: "aimed hard control" },
  "staff-gravity-well": { duration: "3.0s hazard", ticks: "pulse damage", hitbox: "aoe vortex", range: "420", hitboxInfo: "pulls enemies" },
  "staff-consecration": { duration: "area persists", ticks: "heal/damage pulses", hitbox: "aoe sigil", range: "420", hitboxInfo: "heals allies, damages hostiles" },
  "staff-dispel-nova": { hitbox: "self aoe nova", hitboxInfo: "cleanses and pushes nearby pressure" },
  "staff-maelstrom": { duration: "channel", ticks: "storm pulses", hitbox: "aimed aoe storm", range: "450" },
  "staff-tranquility": { duration: "channel", ticks: "healing pulses", hitbox: "ally aoe", range: "450" },
  "wand-magic-missile": { hitbox: "homing projectile", range: "540", homing: "very strong aimed-target pull", projectileInfo: "seeks nearest aimed hostile" },
  "wand-hex": { hitbox: "projectile line", range: "600", projectileInfo: "adds Hex stacks" },
  "wand-mending-spark": { hitbox: "homing ally projectile", range: "700", homing: "nearest ally near aim" },
  "wand-focused-ray": { damage: "channeled ray burst", hitbox: "line beam", range: "500" },
  "wand-soul-bind": { duration: "link window", hitbox: "targeted tether", range: "420", hitboxInfo: "shares damage between linked hostiles" },
  "wand-flash-heal": { hitbox: "ally targeted heal", range: "420" },
  "wand-blink": { hitbox: "movement teleport", range: "240" },
  "wand-phase-shift": { duration: "phase window", hitbox: "self buff", hitboxInfo: "i-frame phase movement" },
  "wand-rewind": { hitbox: "self rewind", hitboxInfo: "returns toward prior position and restores lost HP" },
  "wand-mirror-shield": { duration: "next-hit shield", hitbox: "self shield", hitboxInfo: "absorbs and reflects damage" },
  "wand-nightmare": { hitbox: "line control", range: "420", hitboxInfo: "fear/control pressure" },
  "wand-rupture": { damage: "consumes Hex stacks for bonus damage", hitbox: "targeted burst", range: "420" },
  "wand-enfeeble": { duration: "3.0s pool", charge: "0-1.0s hold", hitbox: "aoe 90-180 radius", range: "420", hitboxInfo: "weakens hostile outgoing damage" },
  "wand-chaos-volley": { damage: "6 spell damage per dart", duration: "channel", ticks: "0.125s, up to 24 darts", hitbox: "homing line darts", range: "500", homing: "random target in front cone" },
  "wand-apotheosis": { duration: "5.0s ally amp", hitbox: "ally tether", range: "450" },
  "twin-strike": { damage: "martial 8", duration: "0.1s dash", hitbox: "cone 55 range, 45deg half-angle", range: "0.15 pmsps dash" },
  "twin-toxic-slash": { damage: "martial 5 + poison", duration: "0.1s dash", hitbox: "cone 60 range, 50deg half-angle", range: "0.15 pmsps dash", hitboxInfo: "applies poison stacks" },
  "twin-throwing-dirk": { damage: "martial 6", hitbox: "projectile line 6 width", range: "280", projectileInfo: "slows target 2.0s" },
  "twin-shadow-lunge": { damage: "martial 16-19", duration: "0.15s dash", hitbox: "dash line 18 width", range: "1.25 pmsps", hitboxInfo: "cross-through hits harder" },
  "twin-exsanguinate": { damage: "martial 12 + 6 per poison stack", duration: "0.15s dash", hitbox: "cone 65 range, 60deg half-angle", range: "0.22 pmsps dash", hitboxInfo: "consumes poison stacks" },
  "twin-fan-of-knives": { damage: "martial 10 per knife", hitbox: "5 projectile lines", range: "275", projectileInfo: "applies anti-heal" },
  "twin-swift-step": { duration: "0.2s dash + 1.5s swift", hitbox: "movement dash", range: "220" },
  "twin-smoke-bomb": { duration: "3.0s smoke", hitbox: "aoe 130 radius", hitboxInfo: "stealths player and blinds enemies" },
  "twin-bloodlust": { duration: "2.5s buff", hitbox: "self buff" },
  "twin-blur": { duration: "0.75s i-frame", hitbox: "self buff" },
  "twin-vanish": { duration: "4.0s stealth", hitbox: "self buff" },
  "twin-noxious-flask": { damage: "martial 3 per tick", duration: "4.0s pool", hitbox: "aoe 100 radius", range: "350" },
  "twin-deaths-mark": { damage: "martial 4", duration: "3.0s mark", hitbox: "targeted or line pick", range: "350", hitboxInfo: "amplifies follow-up damage" },
  "twin-blade-dance": { damage: "martial 8 per tick", duration: "channel", ticks: "0.25s", hitbox: "aoe 110 radius" },
  "twin-assassinate": { damage: "martial 48", duration: "0.2s dash", hitbox: "target pick or line", range: "3.20 pmsps", hitboxInfo: "dashes to target; refunds Energy on kill" },
  "blade-cleave": { damage: "martial 12", duration: "0.15s dash", hitbox: "cone 75 range, 65deg half-angle", range: "0.10 pmsps dash" },
  "blade-sever": { damage: "martial 10", duration: "0.15s dash + 3.0s mortal flag", hitbox: "cone 70 range, 55deg half-angle", range: "0.10 pmsps dash" },
  "blade-sunder": { damage: "martial 11", duration: "0.15s dash + 3.0s fractured flag", hitbox: "cone 72 range, 50deg half-angle", range: "0.10 pmsps dash" },
  "blade-brutal-strike": { damage: "martial 26", duration: "0.2s dash", hitbox: "cone 85 range, 45deg half-angle", range: "0.45 pmsps dash", hitboxInfo: "stuns and interrupts" },
  "blade-thrust": { damage: "martial thrust", duration: "0.25s dash", hitbox: "dash line", range: "1.45 pmsps + 180 strike" },
  "blade-bloodthirst": { damage: "martial cone hit", duration: "0.15s dash", hitbox: "cone", range: "0.30 pmsps dash", hitboxInfo: "heals from damage dealt" },
  "blade-combat-roll": { duration: "0.3s roll", hitbox: "movement dash", range: "1.60 pmsps" },
  "blade-leap-attack": { damage: "leap impact", duration: "0.4s leap", hitbox: "aoe landing", range: "2.15 pmsps" },
  "blade-juggernaut": { duration: "juggernaut buff", hitbox: "self buff" },
  "blade-riposte": { duration: "counter window", hitbox: "self guard", hitboxInfo: "counter heals and refunds half cooldown" },
  "blade-iron-will": { duration: "damage reduction + decaying haste", hitbox: "self buff", hitboxInfo: "breaks control and heals" },
  "blade-intimidating-shout": { duration: "weaken/slow + ally haste/regen", hitbox: "self aoe shout", hitboxInfo: "weakens nearby enemy damage and supports allies" },
  "blade-razor-wind": { damage: "charged crescent hit", charge: "0-1.0s hold", hitbox: "projectile line", range: "350-550", projectileInfo: "full charge slows" },
  "blade-omnislash": { damage: "teleport strike chain", duration: "channel", hitbox: "nearby target chain", range: "350 then 200" },
  "blade-duelists-trance": { duration: "trance window", hitbox: "self buff", hitboxInfo: "accelerates basics and heals basic hits" }
};

function seconds(ms: number) {
  if (ms <= 0) return "0s";
  const value = ms / 1000;
  return value >= 10 ? `${Math.round(value)}s` : `${Math.round(value * 10) / 10}s`;
}

function cooldownText(player: PlayerEntity | undefined, slot: CombatSlot, abilityId: string, locked: boolean | undefined) {
  if (locked) return "locked";
  const remaining = slotCooldownMs(player, slot);
  if (remaining > 0) return `${seconds(remaining)} left`;
  if (slot === "R") {
    if (!player) return "100 Energy";
    return energyReady(player) ? "100 Energy ready" : `${Math.floor(energyValue(player))}/${Math.floor(energyMax(player))} Energy`;
  }
  const base = playerAbilityMetadata[abilityId]?.cooldownMs ?? 0;
  return base > 0 ? `${seconds(base)} cooldown` : "ready";
}

function inferredHitbox(description: string) {
  const text = description.toLowerCase();
  if (text.includes("cone")) return "cone";
  if (text.includes("aoe") || text.includes("storm") || text.includes("sigil") || text.includes("pool") || text.includes("nova")) return "aoe";
  if (text.includes("projectile") || text.includes("arrow") || text.includes("dart") || text.includes("bolt")) return "projectile";
  if (text.includes("beam") || text.includes("ray") || text.includes("tether")) return "line";
  if (text.includes("dash") || text.includes("leap") || text.includes("blink") || text.includes("teleport")) return "movement";
  if (text.includes("shield") || text.includes("stealth") || text.includes("buff")) return "self buff";
  return undefined;
}

function detailFor(abilityId: string, description: string): AbilityTooltipDetail {
  const explicit = DETAILS[abilityId];
  if (explicit) return explicit;
  const hitbox = inferredHitbox(description);
  return hitbox ? { hitbox } : {};
}

function hasValue(text: string | undefined) {
  return Boolean(text && (/\d/.test(text) || text.includes("next-hit")));
}

export function abilityTooltip(player: PlayerEntity | undefined, slot: CombatSlot, abilityId: string, locked?: boolean): AbilityTooltip {
  const meta = playerAbilityMetadata[abilityId];
  const name = meta?.name ?? abilityId.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const description = SUMMARY_BY_ID[abilityId] ?? "Skill details unavailable.";
  const detail = detailFor(abilityId, description);
  const windup = meta?.castMs && meta.castMs > 0 ? seconds(meta.castMs) : undefined;
  const details: string[] = [];
  if (hasValue(detail.damage)) details.push(`Damage ${detail.damage}${detail.duration || detail.ticks ? ` (${[detail.duration, detail.ticks].filter(Boolean).join(" / ")})` : ""}`);
  else if (hasValue(detail.duration)) details.push(`Duration ${detail.duration}${detail.ticks ? ` / ${detail.ticks}` : ""}`);
  if (windup) details.push(`Windup ${windup}`);
  if (detail.charge) details.push(`Charge ${detail.charge}`);
  if (detail.hitbox) details.push(`Hitbox ${detail.hitbox}`);
  if (detail.range || detail.projectileSpeed || detail.homing) details.push([detail.range ? `Range ${detail.range}` : "", detail.projectileSpeed ? `Projectile speed ${detail.projectileSpeed}` : "", detail.homing ? `Homing ${detail.homing}` : ""].filter(Boolean).join(" | "));
  if (detail.projectileInfo) details.push(`Projectile ${detail.projectileInfo}`);
  if (detail.hitboxInfo) details.push(`Hitbox ${detail.hitboxInfo}`);
  return {
    header: `[${slot}] ${name} | ${cooldownText(player, slot, abilityId, locked)}`,
    description,
    details
  };
}

export function abilityTooltipTitle(player: PlayerEntity | undefined, slot: CombatSlot, abilityId: string, locked?: boolean) {
  const tooltip = abilityTooltip(player, slot, abilityId, locked);
  return [tooltip.header, tooltip.description, ...tooltip.details].join("\n");
}
