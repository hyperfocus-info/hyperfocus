import { describe, expect, test } from "bun:test";
import {
  assertPanelLayoutDescriptors,
  normalizePanelGroupLayout,
  resetPanelGroupPanel,
  resizePanelGroupPanel,
  togglePanelGroupPanel,
  type PanelLayoutDescriptor,
} from "./panel-group-layout";

const panels: readonly PanelLayoutDescriptor[] = [
  {
    id: "resources",
    label: "Resources",
    axis: "horizontal",
    minimumSize: 180,
    defaultSize: 260,
    maximumSize: 480,
    collapseMode: "hidden",
    persistenceScope: "editor.workspace.stage",
  },
  {
    id: "viewport",
    label: "Viewport",
    axis: "horizontal",
    minimumSize: 320,
    defaultSize: 720,
    maximumSize: 2_000,
    collapseMode: "none",
    persistenceScope: "editor.workspace.stage",
  },
];

describe("PanelGroup layout", () => {
  test("normalizes app-provided layouts by stable panel id", () => {
    const layout = normalizePanelGroupLayout(panels, {
      resources: { size: 1, collapsed: true },
      viewport: { size: 9_000, collapsed: true },
      obsolete: { size: 100, collapsed: false },
    });

    expect(layout).toEqual({
      resources: { size: 180, collapsed: true },
      viewport: { size: 2_000, collapsed: false },
    });
    expect("obsolete" in layout).toBe(false);
  });

  test("clamps resize, resets to the declared default, and respects collapse mode", () => {
    const layout = normalizePanelGroupLayout(panels, { resources: { size: 360 } });
    expect(resizePanelGroupPanel(panels, layout, "resources", 900).resources?.size).toBe(480);
    expect(resetPanelGroupPanel(panels, layout, "resources").resources?.size).toBe(260);
    expect(togglePanelGroupPanel(panels, layout, "resources").resources?.collapsed).toBe(true);
    expect(togglePanelGroupPanel(panels, layout, "viewport").viewport?.collapsed).toBe(false);
    expect(() => resizePanelGroupPanel(panels, layout, "missing", 200)).toThrow("Unknown PanelGroup panel id");
  });

  test("rejects ambiguous descriptors before rendering", () => {
    expect(() => assertPanelLayoutDescriptors([])).toThrow("at least one");
    expect(() => assertPanelLayoutDescriptors([{ ...panels[0]!, id: "" }])).toThrow("non-empty");
    expect(() => assertPanelLayoutDescriptors([panels[0]!, { ...panels[1]!, id: panels[0]!.id }])).toThrow("duplicated");
    expect(() => assertPanelLayoutDescriptors([panels[0]!, { ...panels[1]!, axis: "vertical" }])).toThrow("cannot mix");
    expect(() => assertPanelLayoutDescriptors([{ ...panels[0]!, persistenceScope: "" }])).toThrow("persistence scope");
    expect(() => assertPanelLayoutDescriptors([{ ...panels[0]!, maximumSize: 100 }])).toThrow("maximum size");
  });
});
