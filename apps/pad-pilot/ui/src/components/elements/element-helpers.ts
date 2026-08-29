/** Joins populated CSS class slots for shared PadPilot elements. */
export function joinElementClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}
