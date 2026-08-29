import { describe, expect, it } from "bun:test";

const projectNavigationSources = [
  {
    source: new URL("./project-sidebar/project-sidebar.tsx", import.meta.url),
    styleImport: 'from "../project-navigation.styles"'
  },
  {
    source: new URL("./project-switcher-dialog.tsx", import.meta.url),
    styleImport: 'from "./project-navigation.styles"'
  }
];

describe("Project navigation StyleX boundary", () => {
  it("keeps project presentation out of legacy and raw utility class strings", async () => {
    const sources = await Promise.all(projectNavigationSources.map(async ({ source, styleImport }) => ({
      source: await Bun.file(source).text(),
      styleImport
    })));

    for (const { source, styleImport } of sources) {
      expect(source).toContain(styleImport);
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList");
      expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass|wrapperClass)="/);
      expect(source).not.toMatch(/\b(?:dense-|grid-cols-|bg-(?:amber|emerald|rose|sky|slate|stone|white)-|h-\d|w-\d|text-\[)/);
    }
  });
});
