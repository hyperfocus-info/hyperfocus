/** Independent reference formula for the published license examples. */
export function annualRoyalty(adjustedRevenue: number): number {
  return 0.05 * Math.max(0, adjustedRevenue - 50_000);
}
