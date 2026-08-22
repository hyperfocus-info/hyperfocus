import { describe, expect, it } from "bun:test";

const backgroundJobsSources = [
  new URL("./background-jobs-panel.tsx", import.meta.url),
  new URL("./background-job-editor-dialog.tsx", import.meta.url)
];

describe("Background Jobs StyleX boundary", () => {
  it("keeps jobs presentation out of legacy and raw utility class strings", async () => {
    const sources = await Promise.all(backgroundJobsSources.map((source) => Bun.file(source).text()));

    for (const source of sources) {
      expect(source).toContain('from "./background-jobs.styles"');
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList=");
      expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass|wrapperClass)="/);
      expect(source).not.toMatch(/\b(?:dense-|border-l-|grid-cols-|bg-(?:amber|emerald|rose|sky|slate|stone)-|h-\d|w-\d)/);
    }
  });
});
