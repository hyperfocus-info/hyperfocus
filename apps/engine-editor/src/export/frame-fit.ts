export type ExportFrameFit = "contain" | "cover" | "stretch";

export function resolveExportFrameRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fit: ExportFrameFit,
) {
  if (fit === "stretch") return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  const scale = fit === "cover"
    ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
    : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}
