





export function title(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).replace(/[-_]/g, " ");
}
