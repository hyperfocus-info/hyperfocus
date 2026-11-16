export function opaqueName(ordinal: number) {
  return `q${((ordinal + 17) * 7919).toString(36)}`;
}
