export function shouldCollapseButtonGroup(width: number, collapseWidth?: number) {
  return typeof collapseWidth === "number" && width < collapseWidth;
}
