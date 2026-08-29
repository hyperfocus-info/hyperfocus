import { createUiTest } from "../../../utils/tests/test-harness";
import { expect, it } from "bun:test";
import { fromBinary } from "@bufbuild/protobuf";
import {
  createDefaultControllerConfig,
  createTemplateCustomLayout,
  encodeControllerConfigRequestBase64,
  normalizeControllerConfig,
} from "./controller-config";
import { base64ToBytes } from "../proto/base64";
import { SetControllerConfigRequestSchema } from "../proto/generated/bridge-pb";

createUiTest("controller-config", () => {
  it("normalizes empty controller config into one primary row", () => {
    const normalized = normalizeControllerConfig({ rows: [], customLayouts: [] });

    expect(normalized.rows).toHaveLength(1);
    expect(normalized.rows[0]?.isPrimary).toBe(true);
    expect(normalized.rows[0]?.layoutKind).toBe("auto");
  });

  it("keeps one primary row when multiple rows are malformed", () => {
    const normalized = normalizeControllerConfig({
      rows: [
        { stableId: "row-1", hardwareId: "pad-a", layoutKind: "xbox", customLayoutId: "", isPrimary: false },
        { stableId: "row-2", hardwareId: "pad-b", layoutKind: "playstation", customLayoutId: "", isPrimary: false },
      ],
      customLayouts: [],
    });

    expect(normalized.rows).toHaveLength(2);
    expect(normalized.rows.filter((row) => row.isPrimary)).toHaveLength(1);
    expect(normalized.rows[0]?.isPrimary).toBe(true);
  });

  it("encodes controller config requests with rows and custom layouts intact", () => {
    const config = createDefaultControllerConfig();
    const customLayout = createTemplateCustomLayout("Studio Pad", "11111111-1111-1111-1111-111111111111");
    customLayout.buttonBindings[0] = { bindingKind: "button", sourceIndex: 9, threshold: 0.6 };
    config.rows[0] = {
      ...config.rows[0]!,
      hardwareId: "pad-b",
      layoutKind: "custom",
      customLayoutId: customLayout.id,
    };
    config.customLayouts.push(customLayout);

    const encoded = encodeControllerConfigRequestBase64(config);
    const decoded = fromBinary(SetControllerConfigRequestSchema, base64ToBytes(encoded));

    expect(decoded.controllerConfig?.rows).toHaveLength(1);
    expect(decoded.controllerConfig?.rows[0]?.hardwareId).toBe("pad-b");
    expect(decoded.controllerConfig?.rows[0]?.customLayoutId).toBe("11111111-1111-1111-1111-111111111111");
    expect(decoded.controllerConfig?.customLayouts).toHaveLength(1);
    expect(decoded.controllerConfig?.customLayouts[0]?.name).toBe("Studio Pad");
    expect(decoded.controllerConfig?.customLayouts[0]?.buttonBindings[0]?.sourceIndex).toBe(9);
  });

  it("bounds hostile controller collections, text, and binding values before encoding", () => {
    const config = createDefaultControllerConfig();
    config.customLayouts = Array.from({ length: 70 }, (_, index) => {
      const layout = createTemplateCustomLayout("\u{1F3AE}".repeat(100), `layout-${index}`);
      layout.buttonBindings = Array.from({ length: 20 }, (_, bindingIndex) => ({
        bindingKind: bindingIndex === 0 ? "button" as const : "axis-positive" as const,
        sourceIndex: 10_000,
        threshold: Number.NaN,
      }));
      layout.axisBindings = Array.from({ length: 10 }, () => ({ sourceIndex: 10_000, inverted: true }));
      return layout;
    });
    config.rows = Array.from({ length: 70 }, (_, index) => ({
      stableId: "duplicate-row",
      hardwareId: "\u{1F39B}\u{FE0F}".repeat(100),
      layoutKind: "custom" as const,
      customLayoutId: `layout-${index}`,
      isPrimary: index < 2,
    }));

    const normalized = normalizeControllerConfig(config);
    expect(normalized.rows).toHaveLength(64);
    expect(normalized.customLayouts).toHaveLength(64);
    expect(new Set(normalized.rows.map((row) => row.stableId)).size).toBe(64);
    expect(normalized.rows.filter((row) => row.isPrimary)).toHaveLength(1);
    expect(new TextEncoder().encode(normalized.rows[0]!.hardwareId).length).toBeLessThanOrEqual(127);
    expect(new TextEncoder().encode(normalized.customLayouts[0]!.name).length).toBeLessThanOrEqual(128);
    expect(normalized.customLayouts[0]!.buttonBindings).toHaveLength(16);
    expect(normalized.customLayouts[0]!.axisBindings).toHaveLength(4);
    expect(normalized.customLayouts[0]!.buttonBindings[0]?.sourceIndex).toBe(31);
    expect(normalized.customLayouts[0]!.buttonBindings[1]?.sourceIndex).toBe(7);
    expect(normalized.customLayouts[0]!.buttonBindings[0]?.threshold).toBe(0.5);
    expect(normalized.customLayouts[0]!.axisBindings[0]?.sourceIndex).toBe(7);
  });
});
