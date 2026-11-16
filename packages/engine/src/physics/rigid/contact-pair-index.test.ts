import { expect, test } from "bun:test";
import { createContactPairIndex } from "./contact-pair-index.ts";

test("contact index preserves unordered pairs across threshold and topology changes", () => {
  const a = new Int32Array(4096), b = new Int32Array(4096);
  const index = createContactPairIndex(a, b);
  const bytes = index.storageBytes;
  for (const count of [0, 64, 127, 128, 512, 1023, 1024, 2048, 4096, 1024, 64, 0]) {
    for (let contact = 0; contact < count; contact += 1) {
      a[contact] = contact % 2 ? 65_535 : contact;
      b[contact] = contact % 2 ? contact : 65_535;
    }
    index.rebuild(count);
    for (let contact = 0; contact < count; contact += 1) {
      expect(index.find(contact, 65_535, contact)).toBe(contact);
      expect(index.find(contact, 65_535, (contact + 1) % count)).toBe(contact);
      expect(index.find(65_535, contact)).toBe(contact);
    }
    expect(index.find(count + 1, 65_535)).toBe(-1);
    expect(index.find(40_000, 50_000)).toBe(-1);
    expect(index.storageBytes).toBe(bytes);
  }
});

test("small contact budgets allocate no index storage", () => {
  expect(createContactPairIndex(new Int32Array(64), new Int32Array(64)).storageBytes).toBe(0);
});
