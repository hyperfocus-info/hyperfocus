/** Portable generic families avoid silently depending on a machine-installed font. */
export const UI_TEXT_FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans serif", css: "system-ui, sans-serif" },
  { value: "serif", label: "Serif", css: "Georgia, serif" },
  { value: "monospace", label: "Monospace", css: "ui-monospace, monospace" },
] as const;

export const UI_TEXT_FONT_WEIGHTS = [
  { value: "400", label: "Regular" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra bold" },
] as const;

/** Both Stage and delivered canvases resolve ordinary UI component data here. */
export function resolveUiTextStyle(options: { values: Readonly<Record<string, string | number | boolean>> }): { font: string; fontSize: number; align: "left" | "right" | "center" } {
  const values = options.values;
  const family = UI_TEXT_FONT_FAMILIES.find((entry) => entry.value === values.fontFamily) ?? UI_TEXT_FONT_FAMILIES[0];
  const weight = UI_TEXT_FONT_WEIGHTS.find((entry) => entry.value === String(values.fontWeight))?.value ?? "700";
  const requestedSize = Number(values.fontSize ?? 24);
  const fontSize = Math.min(256, Math.max(8, Number.isFinite(requestedSize) ? requestedSize : 24));
  const align: "left" | "right" | "center" = values.align === "left" || values.align === "right" ? values.align : "center";
  return { font: `${weight} ${fontSize}px ${family.css}`, fontSize, align };
}
