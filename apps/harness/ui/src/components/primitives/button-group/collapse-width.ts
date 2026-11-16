

export function resolveCollapseWidth(width: number | string | undefined) {
  if (typeof width === "number") {
    return width;
  }
  if (typeof width !== "string") {
    return 352;
  }

  const trimmed = width.trim();
  if (trimmed.endsWith("rem")) {
    const rem = Number(trimmed.slice(0, -3));
    return Number.isFinite(rem) ? rem * 16 : 352;
  }
  if (trimmed.endsWith("px")) {
    const px = Number(trimmed.slice(0, -2));
    return Number.isFinite(px) ? px : 352;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 352;
}
