import { expect, test } from "bun:test";
import { createMmoEntityCollectionBridge, type MmoEntityRecord } from "./index.ts";

test("entity collection bridge builds selector views with owner-only visibility", () => {
  const entities: Array<MmoEntityRecord<{ kind: string }, { token: string }, { hidden: boolean }>> = [
    { id: "npc", type: "npc", x: 0, y: 0, publicData: { kind: "public" }, ownerData: { token: "hidden" } },
    {
      id: "alice-loot",
      type: "loot",
      x: 1,
      y: 0,
      ownerId: "alice",
      visibility: "owner",
      publicData: { kind: "drop" },
      ownerData: { token: "a1" },
      privateData: { hidden: true }
    },
    { id: "private", type: "spawn", x: 2, y: 0, visibility: "private", publicData: { kind: "private" }, privateData: { hidden: true } }
  ];
  const bridge = createMmoEntityCollectionBridge({ entities: () => entities });

  const alice = bridge.select((entity, context) => ({ id: entity.id, owner: context.owner, token: entity.ownerData?.token }), { viewerId: "alice" });
  const bob = bridge.select((entity) => ({ id: entity.id, token: entity.ownerData?.token }), { viewerId: "bob" });

  expect(alice).toEqual([
    { id: "alice-loot", owner: true, token: "a1" },
    { id: "npc", owner: false, token: undefined }
  ]);
  expect(bob).toEqual([{ id: "npc", token: undefined }]);

  entities.push({ id: "later", type: "npc", x: 3, y: 0, publicData: { kind: "late" } });
  expect(bridge.ids({ viewerId: "bob" })).toEqual(["later", "npc"]);
});
