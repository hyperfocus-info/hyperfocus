import { defineSharedSchema } from "@hyperfocus/engine/core";

export const mmoSkillDemoSharedHotSchema = defineSharedSchema({
  x: "f32",
  y: "f32",
  hp: "u16",
  targetId: "u32",
  action: "u8",
  combatState: "u8",
  statusMask: "u32"
});

export const MMO_SKILL_DEMO_SHARED_HOT_BYTE_SIZE = mmoSkillDemoSharedHotSchema.byteSize;

export const MMO_SKILL_DEMO_SHARED_HOT_OFFSETS = {
  x: mmoSkillDemoSharedHotSchema.fieldMap.x.offset,
  y: mmoSkillDemoSharedHotSchema.fieldMap.y.offset,
  hp: mmoSkillDemoSharedHotSchema.fieldMap.hp.offset,
  targetId: mmoSkillDemoSharedHotSchema.fieldMap.targetId.offset,
  action: mmoSkillDemoSharedHotSchema.fieldMap.action.offset,
  combatState: mmoSkillDemoSharedHotSchema.fieldMap.combatState.offset,
  statusMask: mmoSkillDemoSharedHotSchema.fieldMap.statusMask.offset
} as const;

export const MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION = 1;
export const MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE = 2;
export const MMO_SKILL_DEMO_SHARED_HOT_DIRTY_FULL = MMO_SKILL_DEMO_SHARED_HOT_DIRTY_POSITION | MMO_SKILL_DEMO_SHARED_HOT_DIRTY_STATE;
