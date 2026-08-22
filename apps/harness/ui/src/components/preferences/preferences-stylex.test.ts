import { describe, expect, it } from "bun:test";

const preferencesSources = [
  new URL("../preferences-modal.tsx", import.meta.url),
  new URL("./preferences-controls.tsx", import.meta.url)
];

describe("Preferences StyleX boundary", () => {
  it("keeps Preferences presentation out of legacy and utility class strings", async () => {
    const sources = await Promise.all(preferencesSources.map((source) => Bun.file(source).text()));

    for (const source of sources) {
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList=");
      expect(source).not.toContain("panel-shell");
      expect(source).not.toMatch(/(?:triggerClass|wrapperClass|contentClass)="/);
    }
  });
});
