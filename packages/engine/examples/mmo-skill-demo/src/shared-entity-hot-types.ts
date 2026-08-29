import { type MmoSkillDemoAction } from "./shared-contracts.ts";
import { type MmoSkillDemoSharedHotRuntime } from "./shared-entity-registry.ts";

type SharedHotEntityIndex = {
  slots: Uint32Array;
  positionsBySlot: Int32Array;
  count: number;
};

type SharedHotEntityFields = {
  x: number;
  y: number;
  hp: number;
  targetId: number;
  action: number;
  combatState: number;
  statusMask: number;
};

type SharedHotEntityMirror = {
  shared: SharedHotEntityFields;
  runtime: MmoSkillDemoSharedHotRuntime;
  slot: number;
  action: MmoSkillDemoAction;
  targetId: string;
  combatState: string;
  combatFlags: string;
};

export type {
  SharedHotEntityFields,
  SharedHotEntityIndex,
  SharedHotEntityMirror
};
