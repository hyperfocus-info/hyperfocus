import { afterEach, expect, test } from "bun:test";
import { saveCharacterForUser, savedCharacterForUser, savedCharactersByUserId, toSavedCharacter } from "../persistence.ts";
import type { PlayerEntity } from "../shared.ts";

afterEach(() => savedCharactersByUserId.clear());

function player(): PlayerEntity {
  return {
    id: "player-1",
    entityType: "player",
    gatheringXp: { fishing: 12 },
    gatheringLevels: { fishing: 2 },
    inventory: { fish: 3 },
    bank: { ore: 4 },
    equipment: { weapon: "rod" },
    abilitySlots: { "1": "cast" },
    questFlags: { intro: true }
  } as unknown as PlayerEntity;
}

test("saved characters clone every mutable record at each API boundary", () => {
  const active = player();
  const converted = toSavedCharacter(active);
  active.gatheringXp!.fishing = 99;
  active.inventory.fish = 99;
  expect(converted.gatheringXp!.fishing).toBe(12);
  expect(converted.inventory.fish).toBe(3);

  const returned = saveCharacterForUser("alice", active);
  returned.gatheringLevels!.fishing = 99;
  returned.bank.ore = 99;
  const firstRead = savedCharacterForUser("alice")!;
  expect(firstRead.gatheringLevels!.fishing).toBe(2);
  expect(firstRead.bank.ore).toBe(4);

  firstRead.abilitySlots["1"] = "mutated";
  firstRead.questFlags.intro = false;
  const secondRead = savedCharacterForUser("alice")!;
  expect(secondRead.abilitySlots["1"]).toBe("cast");
  expect(secondRead.questFlags.intro).toBe(true);
});
