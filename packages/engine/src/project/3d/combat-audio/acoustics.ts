import type { CombatInteractions } from '../combat-interaction/config.ts';
import type { CombatAudioCue3D } from '../combat-audio-config.ts';
import type { CombatEnvironment } from '../combat-environment/config.ts';

const profiles = {
  wood: ['weaponWood', 'weaponWoodBreak', 'weaponWoodDrop'],
  metal: ['weaponMetal', 'weaponMetalBreak', 'weaponMetalDrop'],
  glass: ['weaponGlass', 'weaponGlassBreak', 'weaponGlassDrop'],
  ceramic: ['weaponCeramic', 'weaponCeramicBreak', 'weaponCeramicDrop'],
  soft: ['weaponSoft', 'weaponSoftBreak', 'weaponSoftDrop'],
  liquid: ['weaponLiquid', 'weaponLiquidBreak', 'weaponLiquidDrop'],
  scatter: ['weaponScatter', 'weaponScatterBreak', 'weaponScatterDrop'],
} as const;

/** Acoustic identity never changes the mechanics material or durability rules. */
export function weaponAcousticCue(weapon: CombatInteractions['weapons'][number], index: 0 | 1 | 2): CombatAudioCue3D {
  return profiles[weapon.acousticProfile ?? weapon.material][index];
}

export function weaponDeployCue(weapon: CombatInteractions['weapons'][number] | undefined): CombatAudioCue3D {
  return weapon?.acousticProfile === 'liquid' ? 'weaponLiquidDeploy' : weapon?.acousticProfile === 'scatter' ? 'weaponScatterDeploy' : 'weaponDeploy';
}

const surfaces = { masonry: 'environmentMasonryBreak', wood: 'environmentWoodBreak', metal: 'environmentMetalBreak', glass: 'environmentGlassBreak' } as const;
export function surfaceBreakCue(surface: CombatEnvironment['surfaces'][number] | undefined): CombatAudioCue3D {
  return surface?.acousticProfile ? surfaces[surface.acousticProfile] : 'environmentBreak';
}
