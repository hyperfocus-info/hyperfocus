import { expect, test } from "bun:test";
import { createDurableMmoServices, createMemoryDurableServiceStore } from "./durable-services.ts";

test("sustained durable service workload preserves money and bounded chat retention", async () => {
  const store = createMemoryDurableServiceStore();
  const services = createDurableMmoServices(store, { maxChatMessagesPerChannel: 100, maxIdempotencyRecords: 50_000 });
  const players = Array.from({ length: 100 }, (_, index) => `player-${index}`);
  for (const player of players) await services.economy.credit(player, "gold", 1_000, "system", `seed-${player}`);
  for (let round = 0; round < 100; round += 1) {
    await Promise.all(players.map((player, index) => services.economy.transfer(player, players[(index + 1) % players.length]!, "gold", 1, `round-${round}-${player}`)));
    await services.chat.send("load", players[round % players.length]!, `round ${round}`, `chat-${round}`);
  }
  const balances = await Promise.all(players.map((player) => services.economy.balance(player, "gold")));
  expect(balances.reduce((sum, value) => sum + value, 0)).toBe(100_000);
  expect(balances.every((value) => value === 1_000)).toBe(true);
  expect((await services.chat.history("load", { limit: 100 })).items).toHaveLength(100);
  const records = await store.exportRecords();
  expect(records.filter((record) => record.bucket === "chat")).toHaveLength(100);
  expect(records.length).toBeLessThan(25_000);
}, 30_000);
