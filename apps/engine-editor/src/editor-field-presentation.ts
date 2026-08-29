import type { EditorComponent, EditorProject } from "@hyperfocus/engine/project";

export type EditorFieldPresentation = {
  kind: "boolean" | "color" | "number" | "text";
  inputType: "checkbox" | "color" | "number" | "text";
  inputMode?: "decimal";
  minimum?: number;
  maximum?: number;
  step?: number | "any";
  unit?: string;
};

export type EditorFieldEntry = readonly [key: string, value: string | number | boolean];

export type EditorComponentSelectOption = Readonly<{ value: string; label: string }>;

export type EditorComponentSelectField = Readonly<{
  key: string;
  label: string;
  description: string;
  value: string;
  options: readonly EditorComponentSelectOption[];
}>;

const COLOR_KEY = /(?:color|colour|tint|fill|stroke)$/i;
const UNIT_RULES: ReadonlyArray<{
  key: RegExp;
  unit: string;
  minimum?: number;
  maximum?: number;
  step: number;
}> = [
  { key: /(?:opacity|alpha)$/i, unit: "%", minimum: 0, maximum: 1, step: 0.01 },
  { key: /(?:angle|rotation|rotationX|rotationY|rotationZ)$/i, unit: "\u00b0", step: 1 },
  { key: /(?:duration|delay|cooldown|interval|time)$/i, unit: "s", minimum: 0, step: 0.01 },
  { key: /(?:speed|velocity)(?:[XYZ])?$/i, unit: "units/s", step: 0.1 },
  { key: /(?:width|height|radius|size|offsetX|offsetY|positionX|positionY)$/i, unit: "px", step: 1 },
];

/** Maps portable component data to a meaningful first-party editor control. */
export function describeEditorField(key: string, value: string | number | boolean): EditorFieldPresentation {
  if (typeof value === "boolean") return { kind: "boolean", inputType: "checkbox" };
  if (typeof value === "number") {
    const rule = UNIT_RULES.find((candidate) => candidate.key.test(key));
    return {
      kind: "number",
      inputType: "number",
      inputMode: "decimal",
      minimum: rule?.minimum,
      maximum: rule?.maximum,
      step: rule?.step ?? "any",
      unit: rule?.unit,
    };
  }
  if (COLOR_KEY.test(key) && /^#[0-9a-f]{6}$/i.test(value)) return { kind: "color", inputType: "color" };
  return { kind: "text", inputType: "text" };
}

/** Human-facing labels keep portable keys stable while avoiding raw camelCase in the inspector. */
export function editorFieldLabel(key: string) {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "Property";
}

/** Behavior module/export are attachment details; every other primitive is a public inspector override. */
export function groupBehaviorFields(values: Record<string, string | number | boolean>): { publicFields: EditorFieldEntry[]; bindingFields: EditorFieldEntry[] } {
  const publicFields: EditorFieldEntry[] = [];
  const bindingFields: EditorFieldEntry[] = [];
  for (const [key, value] of Object.entries(values)) {
    const entry: EditorFieldEntry = [key, value];
    (entry[0] === "module" || entry[0] === "export" ? bindingFields : publicFields).push(entry);
  }
  return { publicFields, bindingFields };
}

/**
 * Defines the small set of portable component references/enums that should not
 * be edited as unconstrained strings. The project remains the source of truth
 * for asset and input-action options.
 */
export function editorComponentSelectFields(component: EditorComponent, project: EditorProject): readonly EditorComponentSelectField[] {
  if (component.type === "sprite") {
    const key = Object.hasOwn(component.values, "assetId") ? "assetId" : "asset";
    return [{
      key,
      label: "Sprite asset",
      description: "Choose an image from this project, or keep the generated shape.",
      value: String(component.values[key] ?? "generated"),
      options: [
        { value: "generated", label: "Generated shape" },
        ...project.assets.filter((asset) => asset.kind === "image").map((asset) => ({ value: asset.id, label: asset.name })),
      ],
    }];
  }
  if (component.type === "input") {
    return [{
      key: "action",
      label: "Input action",
      description: "Actions are configured in Project settings and stay portable with the game.",
      value: String(component.values.action ?? ""),
      options: [
        { value: "", label: "Choose an action…" },
        ...project.settings.input.map((mapping) => ({ value: mapping.action, label: mapping.action })),
      ],
    }];
  }
  if (component.type === "collider") {
    return [{
      key: "shape",
      label: "Collider shape",
      description: "Box and AABB are supported by the portable 2D runtime.",
      value: String(component.values.shape ?? "box"),
      options: [{ value: "box", label: "Box" }, { value: "aabb", label: "AABB" }],
    }];
  }
  if (component.type === "ui") {
    return [{
      key: "align",
      label: "Text alignment",
      description: "Horizontal alignment used by editor preview and playable builds.",
      value: String(component.values.align ?? "center"),
      options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }],
    }];
  }
  return [];
}
