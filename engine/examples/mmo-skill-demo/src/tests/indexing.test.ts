import { expect, test } from "bun:test";
import { groupByKey, indexUniqueBy } from "../data/indexing.ts";

test("data indexes reject duplicate keys instead of silently replacing content", () => {
  expect(() => indexUniqueBy(
    [{ id: "same", value: 1 }, { id: "same", value: 2 }],
    (entry) => entry.id
  )).toThrow("Duplicate data key: same");
});

test("data indexes safely preserve prototype-shaped keys", () => {
  const indexed = indexUniqueBy([{ id: "__proto__", value: 1 }], (entry) => entry.id);
  const grouped = groupByKey([
    { group: "__proto__", value: 1 },
    { group: "__proto__", value: 2 }
  ], (entry) => entry.group);

  expect(Object.getPrototypeOf(indexed)).toBeNull();
  expect(indexed.__proto__?.value).toBe(1);
  expect(Object.getPrototypeOf(grouped)).toBeNull();
  expect(grouped.__proto__?.map((entry) => entry.value)).toEqual([1, 2]);
});
