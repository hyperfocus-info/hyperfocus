import { createMmoWorld } from "@hyperfocus/engine/mmo";
import { mmoSkillDemoCottage, mmoSkillDemoDungeon, mmoSkillDemoZone } from "./shared-room.ts";
import { actorDataModule } from "./data/actors.ts";
import { clientImageSources, itemIcons, itemLabels, uiAssetBase } from "./data/assets.ts";
import { lootDataModule } from "./data/loot.ts";
import { clientContracts } from "./data/quests.ts";
import { skillDataModule } from "./data/skills.ts";
import { equipmentSlots, keyItemOrder } from "./data/ui.ts";
import { mmoSkillDemoRegionConfig } from "./data/world.ts";

export function createMmoSkillDemoGame() {
  const rooms = [mmoSkillDemoZone, mmoSkillDemoDungeon, mmoSkillDemoCottage];
  const world = createMmoWorld({
    id: "mmo-skill-demo",
    data: {
      world: mmoSkillDemoRegionConfig,
      actors: actorDataModule,
      assets: { clientImageSources, itemIcons, itemLabels, uiAssetBase },
      loot: lootDataModule,
      skills: skillDataModule,
      ui: { equipmentSlots, keyItemOrder }
    },
    gameplay: {
      skills: [
        { id: "combat", maxLevel: 99 },
        { id: "mining", maxLevel: 99 },
        { id: "woodcutting", maxLevel: 99 }
      ],
      quests: clientContracts.map((contract) => ({
        id: contract.id,
        goals: { kills: contract.targetKills }
      })),
      lootTables: {
        starter: [
          { itemId: "gold", min: 1, max: 5, weight: 6 },
          { itemId: "glade-berries", min: 1, max: 2, weight: 2 }
        ],
        crags: [
          { itemId: "iron-ore", min: 1, max: 3, weight: 5 },
          { itemId: "cinder-ale", min: 1, max: 1, weight: 1 }
        ],
        bazaar: [
          { itemId: "silk-thread", min: 1, max: 2, weight: 4 },
          { itemId: "ring-focus", min: 1, max: 1, weight: 1 }
        ]
      }
    }
  });
  for (const room of rooms) world.registerRoomType(room);
  return {
    id: "mmo-skill-demo",
    world: mmoSkillDemoRegionConfig,
    engineWorld: world,
    instances: {
      dungeon: { roomType: "mmo-skill-demo-dungeon", roomId: "dungeon-party-1" },
      cottage: { roomType: "mmo-skill-demo-cottage", roomId: "cottage-demo" }
    }
  };
}

export { mmoSkillDemoCottage, mmoSkillDemoDungeon, mmoSkillDemoZone } from "./shared-room.ts";
