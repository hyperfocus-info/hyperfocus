import { describe, expect, test } from "bun:test";
import { normalizeWorkbenchLayout, parseWorkbenchLayout, serializeWorkbenchLayout } from "./layout";

describe("workbench layout", () => {
  test("clamps persisted dimensions", () => {
    expect(normalizeWorkbenchLayout({ sidebarSize: 1, inspectorSize: 2000, bottomSize: Number.NaN })).toMatchObject({ sidebarSize: 180, inspectorSize: 720, bottomSize: 220 });
  });

  test("round trips a versioned layout", () => {
    const layout = normalizeWorkbenchLayout({ sidebarSize: 320, bottomCollapsed: true });
    expect(parseWorkbenchLayout(serializeWorkbenchLayout(layout))).toEqual(layout);
    expect(() => parseWorkbenchLayout('{"version":2,"layout":{}}')).toThrow("Unsupported");
  });
});

