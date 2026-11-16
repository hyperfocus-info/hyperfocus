import { expect, test } from "bun:test";
import { applyProgressionReward, createProgressionProfile, snapshotProgressionLoadout } from "./profile.ts";

test("rewards are replay-safe and conflicting writers cannot overwrite progress", () => {
  const profile = createProgressionProfile({ unlocked: ["jab"] });
  const reward = { id: "match-1", points: 10, unlocks: ["dash"] };
  const first = applyProgressionReward({ profile, expectedRevision: 0, reward });
  expect(first.status).toBe("applied");
  expect(profile.points).toBe(0);
  expect(first.profile.points).toBe(10);
  expect(applyProgressionReward({ profile: first.profile, expectedRevision: 0, reward }).status).toBe("duplicate");
  expect(applyProgressionReward({ profile: first.profile, expectedRevision: 0, reward: { id: "match-2", points: 20 } }).status).toBe("conflict");
  expect(() => applyProgressionReward({ profile: first.profile, expectedRevision: 1, reward: { ...reward, points: 99 } })).toThrow("different content");
});

test("match snapshots own immutable selections and reject locked abilities", () => {
  const profile = createProgressionProfile({ unlocked: ["jab", "dash"] });
  const selections = ["jab"];
  const snapshot = snapshotProgressionLoadout({ profile, rulesVersion: "balance-1", selections });
  selections.push("dash");
  expect(snapshot.selections).toEqual(["jab"]);
  expect(Object.isFrozen(snapshot.selections)).toBe(true);
  expect(() => snapshotProgressionLoadout({ profile, rulesVersion: "balance-1", selections: ["flight"] })).toThrow("locked");
  expect(() => snapshotProgressionLoadout({ profile, rulesVersion: "balance-1", selections: ["jab", "dash"], maxSelections: 1 })).toThrow("limit");
  expect(() => applyProgressionReward({ profile, expectedRevision: 0, reward: { id: "bad", points: -1 } })).toThrow("nonnegative");
});
