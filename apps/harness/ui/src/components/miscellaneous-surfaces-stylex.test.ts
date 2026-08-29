import { describe, expect, it } from "bun:test";

const miscellaneousSurfaceSources = [
  new URL("./notification-inbox/view.tsx", import.meta.url),
  new URL("./mode-editor-panel.tsx", import.meta.url),
  new URL("./execution-plan-dialog.tsx", import.meta.url),
  new URL("./help-tutorial-dialog.tsx", import.meta.url),
  new URL("./setup-checklist-card.tsx", import.meta.url),
  new URL("./thread-cleanup-dialog.tsx", import.meta.url),
  new URL("./tutorial-overlay.tsx", import.meta.url)
];

describe("Miscellaneous harness surfaces StyleX boundary", () => {
  it("keeps small app surfaces out of legacy and raw utility class strings", async () => {
    const sources = await Promise.all(miscellaneousSurfaceSources.map((source) => Bun.file(source).text()));

    for (const source of sources) {
      expect(source).toContain("@stylexjs/stylex");
      expect(source).not.toContain('class="');
      expect(source).not.toContain("classList");
      expect(source).not.toMatch(/(?:contentClass|itemClass|triggerClass|wrapperClass)="/);
      expect(source).not.toMatch(/tutorial-(?:overlay|target)-/);
      expect(source).not.toMatch(/\b(?:bg-(?:amber|emerald|rose|sky|slate|white)-|border-(?:amber|emerald|rose|sky|slate)-|grid-cols-|h-\d|w-\d|text-\[)/);
    }
  });

  it("keeps the execution-plan body viewport bounded and scrollable", async () => {
    const styles = await Bun.file(new URL("./miscellaneous-surfaces.styles.ts", import.meta.url)).text();
    const dialogContent = styles.match(/dialogContent:\s*{([^}]*)}/)?.[1] ?? "";

    expect(dialogContent).toContain('display: "flex"');
    expect(dialogContent).toContain('flexDirection: "column"');
    expect(dialogContent).toContain('gap: "1rem"');
    expect(dialogContent).toContain('maxHeight: "80vh"');
    expect(dialogContent).toContain('overflow: "auto"');
  });
});
