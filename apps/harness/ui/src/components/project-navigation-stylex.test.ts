import { describe, expect, it } from "bun:test";

const projectNavigationSources = [
  new URL("./project-sidebar.tsx", import.meta.url),
  new URL("./project-switcher-dialog.tsx", import.meta.url)
];

describe("Project navigation StyleX boundary", () => {
  it("keeps project presentation out of legacy and raw utility class strings", async () => {
    const sources = await Promise.all(projectNavigationSources.map((source) => Bun.file(source).text()));

    for (const source of sources) {
      expect(source).toContain('from "./project-navigation.styles"');
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList");
      expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass|wrapperClass)="/);
      expect(source).not.toMatch(/\b(?:dense-|grid-cols-|bg-(?:amber|emerald|rose|sky|slate|stone|white)-|h-\d|w-\d|text-\[)/);
    }
  });
});
